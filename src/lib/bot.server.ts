/**
 * Thin client for the externally-hosted Exness provisioning bot
 * (Node service running on Railway).
 *
 * Contract:
 *   POST {BOT_BASE_URL}/provision
 *     Headers: Authorization: Bearer {BOT_API_KEY}
 *     Body:    { balanceNGN: number, idempotencyKey: string }
 *     200 →    { login: string, password: string, server: string }
 *
 *   GET  {BOT_BASE_URL}/equity/:login
 *     Headers: Authorization: Bearer {BOT_API_KEY}
 *     200 →    { equity: number, balance: number, profit: number }
 *
 * SERVER-ONLY. Never import from client code.
 */

const PROVISION_TIMEOUT_MS = 60_000; // bot login + Exness round-trip can be slow
const EQUITY_TIMEOUT_MS = 15_000;

function baseUrl(): string {
  const u = process.env.BOT_BASE_URL;
  if (!u) throw new Error("BOT_BASE_URL env var is not set");
  const trimmed = u.trim().replace(/\/+$/, "");
  // Be defensive: if the secret was set without a scheme (e.g.
  // "fundedng-bot-production.up.railway.app"), prepend https:// so
  // fetch() doesn't reject it as "Invalid URL".
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

function apiKey(): string {
  const k = process.env.BOT_API_KEY;
  if (!k) throw new Error("BOT_API_KEY env var is not set");
  return k;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`bot request timed out after ${ms}ms`)), ms),
    ),
  ]);
}

export interface BotProvisionResult {
  login: string;
  password: string;
  server: string;
}

export async function botProvision(args: {
  balanceNGN: number;
  idempotencyKey: string;
  challengeName?: string;
}): Promise<BotProvisionResult> {
  const res = await withTimeout(
    fetch(`${baseUrl()}/provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        balanceNGN: args.balanceNGN,
        idempotencyKey: args.idempotencyKey,
        challengeName: args.challengeName,
      }),
    }),
    PROVISION_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`bot /provision ${res.status}: ${text.slice(0, 500)}`);
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`bot /provision returned non-JSON: ${text.slice(0, 200)}`);
  }
  if (!json?.login || !json?.password || !json?.server) {
    throw new Error(`bot /provision missing fields: ${text.slice(0, 200)}`);
  }
  return {
    login: String(json.login),
    password: String(json.password),
    server: String(json.server),
  };
}

export interface BotEquityResult {
  equity: number;
  balance: number;
  profit: number;
}

export async function botEquity(login: string): Promise<BotEquityResult> {
  const res = await withTimeout(
    fetch(`${baseUrl()}/equity/${encodeURIComponent(login)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey()}` },
    }),
    EQUITY_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`bot /equity ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  return {
    equity: Number(json.equity) || 0,
    balance: Number(json.balance) || 0,
    profit: Number(json.profit) || 0,
  };
}
