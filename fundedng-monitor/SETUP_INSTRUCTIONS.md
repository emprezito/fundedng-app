# FundedNG Equity Monitor — Setup Instructions

## Step 1: Install Python

1. Go to https://python.org and download Python 3.11 or later
2. Run the installer
3. **IMPORTANT**: Check **"Add Python to PATH"** at the bottom of the first screen
4. Complete the installation

## Step 2: Install Dependencies

Double-click `setup.bat` (or run it from a terminal).

This will:
- Verify Python is installed
- Run `pip install -r requirements.txt` to install all required packages

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env` in the same folder
2. Open `.env` in a text editor
3. Fill in your values:

   | Variable | Description |
   |---|---|
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_SERVICE_KEY` | Your Supabase service role key (secret) |
   | `API_ENDPOINT` | `https://fundedng.fun/api/public/cron/sync-equity-v2` |
   | `API_SECRET` | A secret value shared between this script and the API route |
   | `MT5_PATH` | Path to MT5 terminal (optional, auto-detected if omitted) |

> **Note:** The `API_SECRET` value must match `CRON_SECRET` in your Cloudflare environment variables (set in Cloudflare dashboard → your project → Settings → Variables, or in `wrangler.jsonc` under `[vars]`). The script sends it as the `x-cron-secret` HTTP header.

## Step 4: Test the Monitor

Double-click `run_monitor.bat` to run the script once.

Watch for any errors in the terminal window.

## Step 5: Check the Log

Open `equity_monitor.log` in the same folder to confirm accounts were synced.

Example successful output:
```
2025-01-15 10:00:01 | INFO | === Equity Monitor start ===
2025-01-15 10:00:02 | INFO | Fetched 5 account(s) from Supabase
2025-01-15 10:00:05 | INFO | [12345678] OK — equity=196857.50, balance=200000.00, profit=-3143.00
2025-01-15 10:00:12 | INFO | [87654321] OK — equity=150000.00, balance=150000.00, profit=0.00
2025-01-15 10:00:12 | INFO | === Equity Monitor end — 5 succeeded, 0 failed, 12000ms ===
```

## Step 6: Schedule in Windows Task Scheduler

1. Press **Win + R**, type `taskschd.msc`, press Enter
2. Click **Create Basic Task** (right panel)
3. **Name**: `FundedNG Equity Monitor`
4. **Trigger**: Daily — then click "Repeat every" and set:
   - Repeat task every: `1 minute`
   - Duration: `Indefinitely`
5. **Action**: Start a program
   - Program/script: browse to `run_monitor.bat` in this folder
6. Finish the wizard
7. Right-click the task → **Properties**
8. Check **"Run whether user is logged on or not"**
9. Check **"Run with highest privileges"**
10. Click **OK**

To verify, right-click the task and click **Run**. Check the log after 30 seconds.
