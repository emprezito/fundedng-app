import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PROVISIONING_BASE = "https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai";
const CLIENT_API_BASE = "https://mt-client-api-v1.new-york.agiliumtrade.ai";
const ACCOUNT_INFO_BASE = "https://metaapi-v1.new-york.agiliumtrade.ai";

// MetaQuotes-Demo is the official MT5 demo server from MetaQuotes itself.
// MetaApi supports demo generation on it natively — no servers.dat / custom
// provisioning profile required. Both Exness and IC Markets blocked
// programmatic demo creation on their public servers, so we use this as the
// reliable provisioning target. Traders only see the server name in MT5;
// no broker branding is shown either way.
const PRIMARY_SERVER = "MetaQuotes-Demo";
const DEFAULT_LEVERAGE = 200;
// MetaQuotes-Demo requires a broker-specific account-type string rather than
// the generic "hedged". USD-denominated hedged accounts give us the standard
// MT5 demo behavior we want.
const DEFAULT_ACCOUNT_TYPE = "Forex Hedged USD";
const DEFAULT_KEYWORDS = ["MetaQuotes Software Corp."];

function token(): string {
  const t = process.env.METAAPI_TOKEN;
  if (!t) throw new Error("METAAPI_TOKEN env var is not set");
  return t;
}

function profileId(): string {
  const p = process.env.METAAPI_PROFILE_ID;
  if (!p) throw new Error("METAAPI_PROFILE_ID env var is not set");
  return p;
}

function randomTransactionId(): string {
  return Array.from({ length: 32 }, () =>
    "abcdef0123456789"[Math.floor(Math.random() * 16)],
  ).join("");
}

export interface MetaApiCreateInput {
  email: string;
  name: string;
  phone: string;
  balance: number;
  leverage?: number;
  serverName?: string;
}

export interface MetaApiCreateResult {
  login: string;
  password: string;
  investorPassword: string;
  serverName: string;
}

/**
 * Create an IC Markets MT5 demo account via MetaApi using the operator's
 * custom provisioning profile (METAAPI_PROFILE_ID). Polls 202 responses with
 * a stable transaction id until the account is provisioned (201) or fails.
 */
export async function createMt5DemoAccount(
  input: MetaApiCreateInput,
): Promise<MetaApiCreateResult> {
  const serverName = input.serverName ?? PRIMARY_SERVER;
  const url = `${PROVISIONING_BASE}/users/current/provisioning-profiles/${profileId()}/mt5-demo-accounts`;

  const body = {
    accountType: DEFAULT_ACCOUNT_TYPE,
    balance: input.balance,
    email: input.email,
    leverage: input.leverage ?? DEFAULT_LEVERAGE,
    name: input.name,
    phone: input.phone || "+2348000000000",
    serverName,
    keywords: DEFAULT_KEYWORDS,
  };
  const txId = randomTransactionId();
  const maxAttempts = 12;
  const delayMs = 2500;

  let lastError = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "auth-token": token(),
        "transaction-id": txId,
      },
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      const data = (await res.json()) as Partial<MetaApiCreateResult>;
      return {
        login: String(data.login ?? ""),
        password: data.password ?? "",
        investorPassword: data.investorPassword ?? "",
        serverName: data.serverName ?? serverName,
      };
    }
    if (res.status === 202) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    lastError = `${res.status}: ${await res.text()}`;
    console.warn(`[metaapi] ${serverName}/${DEFAULT_ACCOUNT_TYPE} failed (${lastError})`);
    break;
  }
  throw new Error(`MetaApi provisioning failed on ${serverName} — ${lastError || "still pending after polling"}`);
}

/**
 * Deploy a MetaApi cloud account so the client API can stream/read its state.
 * Required after provisioning so we can later fetch equity. Returns metaapi account id.
 */
export async function deployMetaApiAccount(args: {
  login: string;
  password: string;
  serverName: string;
  name: string;
}): Promise<string | null> {
  // Add account to MetaApi cloud
  const res = await fetch(
    `${CLIENT_API_BASE.replace("mt-client-api-v1", "mt-provisioning-api-v1")}/users/current/accounts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "auth-token": token(),
      },
      body: JSON.stringify({
        login: args.login,
        password: args.password,
        name: args.name,
        server: args.serverName,
        platform: "mt5",
        magic: 0,
        application: "MetaApi",
        type: "cloud-g1",
        region: "new-york",
        reliability: "regular",
      }),
    },
  );
  if (!res.ok) {
    // Soft-fail: account is already created, polling will just be unavailable until admin retries.
    console.error("[metaapi] deploy failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { id?: string };
  return data.id ?? null;
}

/**
 * Fetch live equity/balance for a deployed MetaApi account.
 * Returns null if not deployed yet or account is unreachable.
 */
export async function fetchAccountInformation(metaapiAccountId: string): Promise<{
  equity: number;
  balance: number;
} | null> {
  const res = await fetch(
    `${CLIENT_API_BASE}/users/current/accounts/${metaapiAccountId}/account-information`,
    {
      headers: {
        "auth-token": token(),
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    console.error("[metaapi] account-information failed", metaapiAccountId, res.status);
    return null;
  }
  const data = (await res.json()) as { equity?: number; balance?: number };
  if (typeof data.equity !== "number" || typeof data.balance !== "number") return null;
  return { equity: data.equity, balance: data.balance };
}

/**
 * Resolve the email for a user via auth admin API.
 */
export async function getUserEmail(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user?.email) return null;
  return data.user.email;
}