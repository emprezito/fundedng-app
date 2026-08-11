"""
FundedNG Equity Monitor
=======================
Reads live equity from Exness MT5 accounts via investor password
and posts each account's data to the FundedNG API endpoint.

Run via Task Scheduler every 60 seconds.
Uses pythonw.exe to run silently with no console window.

How it works:
  1. Load env vars from .env in the same folder
  2. Fetch all active/funded accounts that have an investor_password
  3. Initialize MT5 terminal once
  4. For each account (in parallel threads, MT5 locked):
     a. Login with investor password (read-only)
     b. Verify connected login matches requested login
     c. Read equity, balance, profit
      d. Check last 24h trades for scalping violations (<3 min)
      e. Check open positions and recent trades for news violations
      f. Check open positions for stacking (>2 per symbol) / averaging-down
  5. POST each account's data to the FundedNG API (parallel)
  6. Log everything to equity_monitor.log

Safety checks:
  - Login mismatch detection     -> skips account, prevents data corruption
  - Zero equity guard            -> skips account, prevents false breaches
  - Balance sanity check         -> skips if balance < 10% of starting
  - MT5 recovery on error        -> re-initializes MT5 if login fails
  - Thread-local HTTP sessions   -> each thread has its own connection

Weekend holding check:
  - Runs once during Friday close window (20:50-22:10 UTC)
  - Flags any open non-crypto position as a violation
  - POSTed through sync-equity-v2.ts which forwards to handle-weekend-violation.ts
"""

import os
import sys
import time
import logging
import threading
import random
from datetime import datetime, timedelta, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv
import MetaTrader5 as mt5
from supabase import create_client, Client


# ------------------------------------------------------------------
#  CONFIG -- loaded from .env in the same folder
# ------------------------------------------------------------------

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API_ENDPOINT = os.environ["API_ENDPOINT"]
API_SECRET   = os.environ["API_SECRET"]

# Only use MT5_PATH if it's actually set to a non-empty value
_raw_mt5_path = os.environ.get("MT5_PATH", "").strip()
MT5_PATH = _raw_mt5_path if _raw_mt5_path else None

# Max parallel workers. MT5 reads are still sequential
# (protected by lock) but API posts run in parallel.
MAX_WORKERS = 4

# MT5 initialize timeout in milliseconds.
# 30 seconds is enough -- if MT5 isn't responding in 30s it won't in 120s.
MT5_INIT_TIMEOUT_MS = 30000

# Crypto symbols exempt from weekend holding rule -- trade 24/7 on Exness
CRYPTO_SYMBOLS = {
    "BTCUSD", "ETHUSD", "LTCUSD", "BCHUSD", "ADAUSD", "SOLUSD",
    "DOGEUSD", "DOTUSD", "UNIUSD", "LNKUSD", "XLMUSD", "XMRUSD",
    "AAVEUSD", "TRXUSD", "XRPUSD", "TRPUSD",
}

# Fiat currency codes for news event filtering
FIAT_CURRENCIES = {
    "USD", "EUR", "GBP", "JPY", "CHF", "CAD", "AUD", "NZD",
    "SGD", "HKD", "NOK", "SEK", "DKK", "PLN", "TRY", "ZAR",
    "MXN", "ILS", "CNH", "THB", "HUF", "CZK",
}

# Weekend close window -- Exness forex closes Fri 20:59 UTC (summer) / 21:59 UTC (winter)
WEEKEND_CLOSE_START = (20, 50)  # 20:50 UTC
WEEKEND_CLOSE_END   = (22, 10)  # 22:10 UTC


# ------------------------------------------------------------------
#  LOGGING
# ------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
LOG_FILE   = SCRIPT_DIR / "equity_monitor.log"

logger = logging.getLogger("fundedng_monitor")
logger.setLevel(logging.INFO)

_fmt = logging.Formatter(
    "%(asctime)s | %(levelname)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

# File handler -- rotates at 5 MB, keeps 3 backups
_fh = RotatingFileHandler(LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3)
_fh.setFormatter(_fmt)
logger.addHandler(_fh)

# Console handler -- visible when running manually
_ch = logging.StreamHandler(sys.stdout)
_ch.setFormatter(_fmt)
logger.addHandler(_ch)


# ------------------------------------------------------------------
#  MT5 LOCK -- only one MT5 call at a time
# ------------------------------------------------------------------

mt5_lock = threading.Lock()


# ------------------------------------------------------------------
#  THREAD-LOCAL HTTP SESSION
#  Each worker thread gets its own requests.Session
#  Avoids thread-safety issues with shared sessions
# ------------------------------------------------------------------

_thread_local = threading.local()

def get_http_session() -> requests.Session:
    """Return a per-thread requests.Session, creating it if needed."""
    if not hasattr(_thread_local, "session"):
        s = requests.Session()
        s.headers.update({
            "Content-Type":  "application/json",
            "x-cron-secret": API_SECRET,
        })
        _thread_local.session = s
    return _thread_local.session


# ------------------------------------------------------------------
#  MARKET HOURS CHECK
# ------------------------------------------------------------------

def is_market_open() -> bool:
    """
    Returns False on weekends when Exness demo servers are idle.
    Uses UTC time:
      Saturday all day           -> closed
      Sunday before 22:00 UTC   -> closed
      Monday -- Friday            -> open
    """
    now = datetime.now(timezone.utc)
    wd  = now.weekday()  # 0=Mon .. 6=Sun
    if wd == 5:
        return False
    if wd == 6 and now.hour < 22:
        return False
    return True


def is_weekend_close_window() -> bool:
    """
    Returns True on Friday between 20:50 and 22:10 UTC.
    This window covers the Exness weekly close in both summer (20:59 UTC)
    and winter (21:59 UTC), so the weekend holding check runs at the right time.
    """
    now = datetime.now(timezone.utc)
    if now.weekday() != 4:  # 4 = Friday
        return False
    t = (now.hour, now.minute)
    return WEEKEND_CLOSE_START <= t <= WEEKEND_CLOSE_END


# ------------------------------------------------------------------
#  SUPABASE
# ------------------------------------------------------------------

def get_supabase() -> Client:
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_accounts(supabase: Client) -> list[dict]:
    """
    Return active/funded accounts that have investor_password set.
    Accounts without investor_password are silently skipped
    -- they can still be manually updated via the admin panel.
    """
    res = (
        supabase.table("trader_accounts")
        .select(
            "id, mt5_login, investor_password, mt5_server, "
            "starting_balance, peak_equity, status, user_id"
        )
        .in_("status", ["active", "funded"])
        .not_.is_("investor_password", "null")
        .neq("investor_password", "")
        .eq("monitor_paused", False)
        .execute()
    )
    return res.data or []


# ------------------------------------------------------------------
#  MT5 HELPERS
# ------------------------------------------------------------------

def _safe_mt5_shutdown() -> None:
    """Shutdown MT5 without raising -- safe to call even if not initialized."""
    try:
        mt5.shutdown()
    except Exception:
        pass


def _init_mt5() -> bool:
    """
    Initialize the MT5 terminal.
    Returns True on success, False on failure.
    Logs the error if initialization fails.
    """
    if MT5_PATH:
        ok = mt5.initialize(path=MT5_PATH, timeout=MT5_INIT_TIMEOUT_MS)
    else:
        ok = mt5.initialize(timeout=MT5_INIT_TIMEOUT_MS)

    if not ok:
        err = mt5.last_error()
        code = err[0] if isinstance(err, tuple) else 0
        desc = err[1] if isinstance(err, tuple) else str(err)
        logger.error(f"MT5 init failed ({code}): {desc}")

    return ok


def _recover_mt5() -> bool:
    """
    Called after a failed account read.
    Shuts down MT5 and re-initializes to clear any bad state.
    Returns True if recovery succeeded.
    """
    _safe_mt5_shutdown()
    time.sleep(1)  # Brief pause before re-init
    return _init_mt5()


# ------------------------------------------------------------------
#  CURRENCY HELPERS -- for news event filtering
# ------------------------------------------------------------------

def _get_symbol_currencies(symbol: str) -> set:
    """
    Extract relevant currency codes from a trading symbol for news filtering.
    EURUSD -> {EUR, USD}
    GBPJPY -> {GBP, JPY}
    XAUUSD -> {USD}
    BTCUSD -> {USD}
    """
    currencies = set()
    prefix = symbol[:3]
    suffix = symbol[-3:]
    if prefix in FIAT_CURRENCIES:
        currencies.add(prefix)
    if suffix in FIAT_CURRENCIES:
        currencies.add(suffix)
    return currencies


# ------------------------------------------------------------------
#  NEWS CALENDAR -- ForexFactory high-impact events
# ------------------------------------------------------------------

NEWS_CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
_news_cache: list[dict] | None = None
_news_cache_time: float = 0
NEWS_CACHE_TTL = 3600  # 1 hour -- refreshed at most once per hour

def _fetch_high_impact_news() -> list[dict]:
    """
    Fetch high-impact economic events from ForexFactory.
    Returns a list of dicts with 'title', 'timestamp' (unix), and 'currency'.
    Cached for NEWS_CACHE_TTL seconds to avoid hammering the API.
    """
    global _news_cache, _news_cache_time
    now = time.time()
    if _news_cache is not None and now - _news_cache_time < NEWS_CACHE_TTL:
        return _news_cache

    session = get_http_session()
    resp = session.get(NEWS_CALENDAR_URL, timeout=15)
    resp.raise_for_status()
    raw = resp.json()

    # ForexFactory format: array of { date, title, impact, currency, ... }
    # impact "High" or 3 = high impact (red folder)
    events: list[dict] = []
    for item in raw:
        impact = item.get("impact", "")
        is_high = impact == "High" or impact == 3 or str(impact) == "3"
        if not is_high:
            continue
        dt_str = item.get("date", "")
        if not dt_str:
            continue
        try:
            dt = datetime.fromisoformat(dt_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            events.append({
                "title":     item.get("title", "Unknown"),
                "timestamp": int(dt.timestamp()),
                "currency":  item.get("currency", ""),
            })
        except (ValueError, TypeError):
            continue

    _news_cache = events
    _news_cache_time = now
    logger.info(f"Fetched {len(events)} high-impact news events")
    return events


# ------------------------------------------------------------------
#  VIOLATION CHECKS
# ------------------------------------------------------------------

def check_news_violations(open_positions: list, deals: tuple) -> list:
    """
    Check every trade opened in the last 24h (DEAL_ENTRY_IN from deals)
    AND every currently open position against high-impact news events.

    Flags any trade whose open_time falls within 5 minutes before or after
    a high-impact event for that symbol's currency (e.g. EURUSD checks
    EUR and USD events).

    Returns list of dicts: symbol, open_time, event_title, event_time, volume, ticket.
    """
    violations: list[dict] = []
    try:
        events = _fetch_high_impact_news()
        if not events:
            return violations
    except Exception as exc:
        logger.warning(f"[check_news_violations] News calendar fetch failed: {exc}")
        return violations

    # Collect all candidate trades: IN deals + open positions
    candidates: list[dict] = []

    for d in deals:
        if d.entry == 0:
            candidates.append({
                "symbol":    d.symbol,
                "open_time": int(d.time),
                "volume":    d.volume,
                "ticket":    d.ticket,
            })

    for pos in open_positions:
        candidates.append({
            "symbol":    pos["symbol"],
            "open_time": pos["open_time"],
            "volume":    pos["volume"],
            "ticket":    pos["ticket"],
        })

    for c in candidates:
        sym_currencies = _get_symbol_currencies(c["symbol"])
        ot = c["open_time"]
        for ev in events:
            # Skip if no currency overlap
            if sym_currencies and ev.get("currency") not in sym_currencies:
                continue
            diff = ot - ev["timestamp"]  # negative = opened before, positive = after
            if -300 <= diff <= 300:  # within 5 min before or after
                violations.append({
                    "symbol":      c["symbol"],
                    "open_time":   ot,
                    "event_title": ev["title"],
                    "event_time":  ev["timestamp"],
                    "volume":      c["volume"],
                    "ticket":      c["ticket"],
                })
                break

    return violations


def check_weekend_violations(open_positions: list) -> list:
    """
    For every open position where the symbol is NOT a crypto pair,
    flag it as a weekend holding violation.

    Returns list of dicts: symbol, ticket, open_time, volume.
    """
    violations: list[dict] = []
    for pos in open_positions:
        if pos["symbol"] not in CRYPTO_SYMBOLS:
            violations.append({
                "symbol":    pos["symbol"],
                "ticket":    pos["ticket"],
                "open_time": pos["open_time"],
                "volume":    pos["volume"],
            })
    return violations


# Position group window: positions opened within this many seconds of the
# FIRST same-direction position in a batch are checked for rapid lot-splitting.
POSITION_GROUP_WINDOW_SECS = 60
# Hard cap on RAW open positions per symbol per direction (buy/sell).
MAX_POSITIONS_PER_SYMBOL = 2


def check_position_violations(open_positions: list) -> list:
    """
    Detect position-manipulation violations from currently open positions.

    Rules enforced here:
      - Maximum 2 open positions per symbol per direction (buy/sell), counting
        RAW positions. Timing is irrelevant -- opening 10 buy positions within
        60 seconds is still 10 positions and breaches the 2-position cap.
      - Rapid lot-splitting: opening 2+ same-direction positions on a symbol
        within POSITION_GROUP_WINDOW_SECS (60s) of the batch's first entry is
        itself a violation, even when under the 2-position cap.
      - Averaging down is prohibited: adding to a position at a worse price
        than an existing same-direction position on the same symbol.

    Hedging (opposite-direction positions on the same symbol) is allowed.

    Returns list of dicts: type, symbol, tickets, position_count, direction.
    """
    violations: list[dict] = []

    by_symbol: dict[str, list[dict]] = {}
    for p in open_positions:
        by_symbol.setdefault(p["symbol"], []).append(p)

    for symbol, positions in by_symbol.items():
        stacking_breach = False

        for direction, same_dir in (
            ("buy",  [p for p in positions if p["type"] == 0]),
            ("sell", [p for p in positions if p["type"] == 1]),
        ):
            same_dir = sorted(same_dir, key=lambda p: p["open_time"])
            if not same_dir:
                continue

            # Primary: raw same-direction position cap per symbol. Timing is
            # irrelevant -- 10 positions opened in 60s still breaches.
            if len(same_dir) > MAX_POSITIONS_PER_SYMBOL:
                violations.append({
                    "type":           "max_positions",
                    "symbol":         symbol,
                    "tickets":        [str(p["ticket"]) for p in same_dir],
                    "position_count": len(same_dir),
                    "direction":      direction,
                })
                stacking_breach = True
                continue

            # Secondary: rapid lot-splitting -- entries clustered within the
            # 60s window of the batch's FIRST entry breach even under the cap.
            if len(same_dir) >= 2 and \
               same_dir[-1]["open_time"] - same_dir[0]["open_time"] <= POSITION_GROUP_WINDOW_SECS:
                violations.append({
                    "type":           "lot_splitting",
                    "symbol":         symbol,
                    "tickets":        [str(p["ticket"]) for p in same_dir],
                    "position_count": len(same_dir),
                    "direction":      direction,
                })
                stacking_breach = True

        # Stacking already breaches -- skip averaging-down duplicates.
        if stacking_breach:
            continue

        # Averaging down: a later same-direction entry at a worse price than an
        # earlier same-direction entry (buy = lower price, sell = higher price).
        for i, pos in enumerate(positions):
            for earlier in positions[:i]:
                if earlier["type"] != pos["type"]:
                    continue
                if pos["type"] == 0 and pos["price_open"] < earlier["price_open"]:
                    violations.append({
                        "type":           "averaging_down",
                        "symbol":         symbol,
                        "tickets":        [str(earlier["ticket"]), str(pos["ticket"])],
                        "position_count": 2,
                        "direction":      "buy",
                    })
                    break
                if pos["type"] == 1 and pos["price_open"] > earlier["price_open"]:
                    violations.append({
                        "type":           "averaging_down",
                        "symbol":         symbol,
                        "tickets":        [str(earlier["ticket"]), str(pos["ticket"])],
                        "position_count": 2,
                        "direction":      "sell",
                    })
                    break

    return violations


# ------------------------------------------------------------------
#  MT5 ACCOUNT READ
# ------------------------------------------------------------------

def read_account(
    login: str,
    investor_pw: str,
    server: str,
    starting_balance: float = 0,
    weekend_window: bool = False,
) -> dict:
    """
    Login to MT5 account with investor password and read live data.

    Returns:
        dict with equity, balance, profit, scalping_violations,
        news_violations, open_positions, weekend_violations

    Raises:
        RuntimeError -- on any problem (caller logs and skips account)
    """
    # Switch to this account using investor (read-only) password
    login_ok = mt5.login(
        login    = int(login),
        password = investor_pw,
        server   = server,
    )
    if not login_ok:
        err  = mt5.last_error()
        code = err[0] if isinstance(err, tuple) else 0
        desc = err[1] if isinstance(err, tuple) else str(err)
        raise RuntimeError(f"Login to {login} failed ({code}): {desc}")

    # Read account info
    info = mt5.account_info()
    if info is None:
        raise RuntimeError(f"account_info() returned None for {login}")

    # -- Safety 1: verify we're actually on the right account ----------
    if str(info.login) != str(login):
        raise RuntimeError(
            f"Login mismatch: requested {login} "
            f"but MT5 returned {info.login} -- "
            f"skipping to prevent data corruption"
        )

    # -- Safety 2: reject zero or negative equity -----------------------
    if info.equity <= 0:
        raise RuntimeError(
            f"Equity is {info.equity} for {login} -- "
            f"bad read, skipping"
        )

    # -- Safety 3: reject suspiciously low balance ----------------------
    if starting_balance > 0 and info.balance < starting_balance * 0.10:
        raise RuntimeError(
            f"Balance {info.balance} is below 10% of starting "
            f"{starting_balance} for {login} -- bad read, skipping"
        )

    # -- Read closed deals (last 7 days) for scalping + news checks --------
    # A wide window ensures entry deals (DEAL_ENTRY_IN) are captured for trades
    # that were opened days ago but closed recently. A narrow 24h window would
    # silently drop exit deals whose entry fell outside the window.
    now   = datetime.now(timezone.utc).replace(tzinfo=None)
    since = now - timedelta(days=7)
    deals = mt5.history_deals_get(since, now) or []

    # -- Read open positions -------------------------------------------
    open_positions_raw = mt5.positions_get() or []

    open_positions: list[dict] = []
    for p in open_positions_raw:
        open_positions.append({
            "symbol":      p.symbol,
            "ticket":      p.ticket,
            "open_time":   int(p.time),
            "volume":      p.volume,
            "position_id": p.position_id,
            "type":        p.type,          # 0 = buy, 1 = sell
            "price_open":  p.price_open,
        })

    # -- Scalping check: ALL trades closed in under 3 min are flagged ---
    # No close-type exemption -- SL, TP, and manual closes all count.
    open_times: dict[int, int] = {}
    for d in deals:
        if d.entry == 0:  # DEAL_ENTRY_IN
            open_times[d.position_id] = d.time

    scalping: list[dict] = []
    closed_deals: list[dict] = []
    for d in deals:
        if d.entry == 1:  # DEAL_ENTRY_OUT
            ot = open_times.get(d.position_id)
            if ot is not None:
                secs = int(d.time - ot)
                if 0 < secs < 180:
                    scalping.append({
                        "symbol":           d.symbol,
                        "open_time":        int(ot),
                        "close_time":       int(d.time),
                        "duration_seconds": secs,
                        "profit":           round(d.profit, 2),
                        "volume":           d.volume,
                        "ticket":           d.ticket,
                    })
                closed_deals.append({
                    "ticket":           d.ticket,
                    "symbol":           d.symbol,
                    "open_time":        int(ot),
                    "close_time":       int(d.time),
                    "duration_seconds": secs,
                    "profit":           round(d.profit, 2),
                    "volume":           d.volume,
                })

    # -- News trading check: trades opened near high-impact news --------
    news_violations = check_news_violations(open_positions, deals)

    # -- Weekend holding check: only during Friday close window ---------
    weekend_violations: list[dict] = []
    if weekend_window:
        weekend_violations = check_weekend_violations(open_positions)

    # -- Position violations: max 2 raw positions/symbol/direction, no
    #    lot-splitting, no averaging down --
    position_violations = check_position_violations(open_positions)

    return {
        "equity":              round(info.equity,  2),
        "balance":             round(info.balance, 2),
        "profit":              round(info.profit,  2),
        "scalping_violations": scalping,
        "news_violations":     news_violations,
        "open_positions":      open_positions,
        "weekend_violations":  weekend_violations,
        "closed_deals":        closed_deals,
        "position_violations": position_violations,
    }


# ------------------------------------------------------------------
#  API POST
# ------------------------------------------------------------------

def post_snapshot(
    account_id: str,
    mt5_login: str,
    equity: float,
    balance: float,
    profit: float,
    scalping_violations: list,
    news_violations: list,
    weekend_violations: list,
    closed_deals: list,
    position_violations: list,
) -> None:
    """
    POST equity data to the FundedNG sync endpoint.
    Uses a per-thread session for thread safety.
    Raises requests.HTTPError on 4xx/5xx responses.
    """
    session = get_http_session()
    payload = {
        "account_id":          account_id,
        "mt5_login":           mt5_login,
        "equity":              equity,
        "balance":             balance,
        "profit":              profit,
        "scalping_violations": scalping_violations,
        "news_violations":     news_violations,
        "weekend_violations":  weekend_violations,
        "closed_deals":        closed_deals,
        "position_violations": position_violations,
    }
    resp = session.post(API_ENDPOINT, json=payload, timeout=20)
    if resp.status_code >= 400:
        raise requests.HTTPError(
            f"API {resp.status_code}: {resp.text[:200]}"
        )


# ------------------------------------------------------------------
#  PROCESS ONE ACCOUNT  (runs in thread pool)
# ------------------------------------------------------------------

def process_account(acct: dict) -> dict:
    """
    Full pipeline for one trader account:
      1. Acquire MT5 lock (ensures sequential MT5 access)
      2. Login, read equity, check scalping, news, weekend violations
      3. On error: attempt MT5 recovery so next account isn't affected
      4. Release MT5 lock
      5. POST data to API (runs in parallel with next account's MT5 read)

    Returns a result dict { login, ok, error }.
    """
    login     = str(acct.get("mt5_login", ""))
    acct_id   = str(acct.get("id", ""))
    inv_pw    = str(acct.get("investor_password") or "")
    server    = str(acct.get("mt5_server") or "Exness-MT5Trial9")
    start_bal = float(acct.get("starting_balance") or 0)

    result = {"login": login, "ok": False, "error": ""}

    # Small random jitter so threads don't all slam the lock together
    time.sleep(random.uniform(0, 0.5))

    # Check if we're in the weekend close window
    weekend_window = is_weekend_close_window()

    # -- Step 1 & 2: MT5 read (serialized via lock) --------------------
    data: dict | None = None
    with mt5_lock:
        try:
            data = read_account(login, inv_pw, server, start_bal, weekend_window)
        except Exception as exc:
            logger.error(f"[{login}] MT5 error: {exc}")
            result["error"] = str(exc)
            logger.info(f"[{login}] Recovering MT5 for next account...")
            recovered = _recover_mt5()
            if not recovered:
                logger.warning(
                    "[MT5] Recovery failed -- remaining accounts may also fail"
                )
            return result

    # -- Step 3: POST to API (runs while next thread reads MT5) --------
    scalping_violations = data.get("scalping_violations", [])
    news_violations     = data.get("news_violations", [])
    weekend_violations  = data.get("weekend_violations", [])
    closed_deals        = data.get("closed_deals", [])
    position_violations = data.get("position_violations", [])
    try:
        post_snapshot(
            account_id          = acct_id,
            mt5_login           = login,
            equity              = data["equity"],
            balance             = data["balance"],
            profit              = data["profit"],
            scalping_violations = scalping_violations,
            news_violations     = news_violations,
            weekend_violations  = weekend_violations,
            closed_deals        = closed_deals,
            position_violations = position_violations,
        )
    except Exception as exc:
        logger.error(f"[{login}] API error: {exc}")
        result["error"] = str(exc)
        return result

    # -- Log -----------------------------------------------------------
    if scalping_violations:
        logger.warning(
            f"[{login}] SCALPING DETECTED -- "
            + ", ".join(
                f"{v['symbol']} {v['duration_seconds']}s"
                for v in scalping_violations
            )
        )
    if news_violations:
        logger.warning(
            f"[{login}] NEWS VIOLATION -- "
            + ", ".join(
                f"{v['symbol']} opened near {v['event_title']}"
                for v in news_violations
            )
        )
    if weekend_violations:
        logger.warning(
            f"[{login}] WEEKEND HOLDING DETECTED -- "
            + ", ".join(
                f"{v['symbol']} #{v['ticket']}"
                for v in weekend_violations
            )
        )
    if position_violations:
        logger.warning(
            f"[{login}] POSITION VIOLATION -- "
            + ", ".join(
                f"{v['symbol']} ({v['type']})"
                for v in position_violations
            )
        )

    logger.info(
        f"[{login}] OK  "
        f"e={data['equity']}  "
        f"b={data['balance']}  "
        f"p={data['profit']}"
    )
    result["ok"] = True
    return result


# ------------------------------------------------------------------
#  MAIN
# ------------------------------------------------------------------

def main() -> None:
    start = time.time()
    logger.info("=" * 50)
    logger.info("Equity Monitor started")

    # Note: is_market_open() is intentionally NOT called here.
    # The monitor runs on its normal interval (60s) every day of the week,
    # including weekends, so crypto positions with 24/7 trading continue
    # to get equity sync, drawdown checks, and scalping/news detection.

    # Connect to Supabase and fetch accounts
    try:
        supabase = get_supabase()
    except Exception as exc:
        logger.error(f"Supabase failed: {exc}")
        sys.exit(1)

    accounts = fetch_accounts(supabase)
    total    = len(accounts)
    logger.info(f"Fetched {total} account(s)")

    if total == 0:
        logger.info("No accounts to monitor -- done")
        return

    # Initialize MT5 once -- reused across all account reads via mt5.login()
    logger.info("Initializing MT5...")
    if not _init_mt5():
        sys.exit(1)
    logger.info("MT5 initialized")

    # Process accounts -- MT5 reads sequential, API posts parallel
    succeeded = 0
    failed    = 0
    workers   = min(total, MAX_WORKERS)

    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            future_map = {
                pool.submit(process_account, acct): acct
                for acct in accounts
            }
            for future in as_completed(future_map):
                acct = future_map[future]
                try:
                    res = future.result(timeout=60)
                    if res["ok"]:
                        succeeded += 1
                    else:
                        failed += 1
                except Exception as exc:
                    logger.error(
                        f"[{acct.get('mt5_login', '?')}] "
                        f"Thread crashed: {exc}"
                    )
                    failed += 1
    finally:
        _safe_mt5_shutdown()

    elapsed = round(time.time() - start, 1)
    logger.info(f"Done -- {succeeded} ok, {failed} failed, {elapsed}s")

    if failed > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
