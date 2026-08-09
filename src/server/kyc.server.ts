import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

export async function runVerifyKycAdmin(input: {
  userId: string;
  accountNumber: string;
  accessToken: string;
}) {
  try {
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(
      input.accessToken,
    );
    if (authErr || !authData.user)
      return { ok: false as const, error: "Please sign in again" };
    const callerId = authData.user.id;

    const { data: roles, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleErr) return { ok: false as const, error: roleErr.message };
    if (!roles?.some((r) => r.role === "admin")) {
      return { ok: false as const, error: "Forbidden: admin role required" };
    }

    const [profileRes, accountsRes] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, bank_account_number, bank_name, bank_account_name, kyc_document_url, kyc_document_type")
        .eq("id", input.userId)
        .maybeSingle(),
      supabaseAdmin
        .from("trader_accounts")
        .select("id")
        .eq("user_id", input.userId)
        .limit(1),
    ]);

    if (profileRes.error) return { ok: false as const, error: profileRes.error.message };
    if (accountsRes.error) return { ok: false as const, error: accountsRes.error.message };

    const profile = profileRes.data;
    if (!profile) return { ok: false as const, error: "Trader profile not found" };
    if (!profile.bank_account_number) {
      return { ok: false as const, error: "Trader has not submitted bank account details" };
    }
    if (!accountsRes.data?.length) {
      return { ok: false as const, error: "Trader has no trader_accounts on record" };
    }

    const submitted = input.accountNumber.trim();
    const onFile = (profile.bank_account_number || "").trim();
    if (submitted !== onFile) {
      return { ok: false as const, error: "Account number does not match the trader's records" };
    }

    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ kyc_verified: true, kyc_document_url: null, kyc_document_type: null })
      .eq("id", input.userId);
    if (updErr) return { ok: false as const, error: updErr.message };

    await supabaseAdmin.from("notifications").insert({
      user_id: input.userId,
      title: "KYC verified",
      message: "Your bank account has been verified. You can now request payouts.",
      type: "success",
    });

    await sendEventEmail({ type: "kyc_approved", userId: input.userId }).catch((e) =>
      console.error("[runVerifyKycAdmin] email send failed", e),
    );

    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    console.error("[runVerifyKycAdmin] unexpected", msg);
    return { ok: false as const, error: msg };
  }
}

export async function runVerifyKycDocumentAdmin(input: {
  userId: string;
  accessToken: string;
}) {
  try {
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(
      input.accessToken,
    );
    if (authErr || !authData.user)
      return { ok: false as const, error: "Please sign in again" };
    const callerId = authData.user.id;

    const { data: roles, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleErr) return { ok: false as const, error: roleErr.message };
    if (!roles?.some((r) => r.role === "admin")) {
      return { ok: false as const, error: "Forbidden: admin role required" };
    }

    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ kyc_verified: true, kyc_document_url: null, kyc_document_type: null })
      .eq("id", input.userId);
    if (updErr) return { ok: false as const, error: updErr.message };

    await supabaseAdmin.from("notifications").insert({
      user_id: input.userId,
      title: "KYC verified",
      message: "Your identity document has been verified. You can now request payouts.",
      type: "success",
    });

    await sendEventEmail({ type: "kyc_approved", userId: input.userId }).catch((e) =>
      console.error("[runVerifyKycDocumentAdmin] email send failed", e),
    );

    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    console.error("[runVerifyKycDocumentAdmin] unexpected", msg);
    return { ok: false as const, error: msg };
  }
}

export async function runRejectKycDocument(input: {
  userId: string;
  reason: string;
  accessToken: string;
}) {
  try {
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(
      input.accessToken,
    );
    if (authErr || !authData.user)
      return { ok: false as const, error: "Please sign in again" };
    const callerId = authData.user.id;

    const { data: roles, error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleErr) return { ok: false as const, error: roleErr.message };
    if (!roles?.some((r) => r.role === "admin")) {
      return { ok: false as const, error: "Forbidden: admin role required" };
    }

    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({ kyc_document_url: null, kyc_document_type: null })
      .eq("id", input.userId);
    if (updErr) return { ok: false as const, error: updErr.message };

    await supabaseAdmin.from("notifications").insert({
      user_id: input.userId,
      title: "KYC document rejected",
      message: input.reason
        ? `Your KYC document was rejected: ${input.reason}. Please upload a valid document.`
        : "Your KYC document was rejected. Please upload a valid document.",
      type: "warning",
    });

    return { ok: true as const };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Rejection failed";
    console.error("[runRejectKycDocument] unexpected", msg);
    return { ok: false as const, error: msg };
  }
}

type Bank = { name: string; code: string; slug: string };
let _bankCache: { at: number; banks: Bank[] } | null = null;

export async function runListNigerianBanks() {
  try {
    const fresh = _bankCache && Date.now() - _bankCache.at < 24 * 3600 * 1000;
    if (fresh && _bankCache) return { ok: true as const, banks: _bankCache.banks };

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false as const, error: "Bank verification is not configured" };

    const res = await fetch(
      "https://api.paystack.co/bank?country=nigeria",
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !json.status || !Array.isArray(json.data)) {
      return { ok: false as const, error: JSON.stringify(json) };
    }
    const banks: Bank[] = (json.data as Array<{ name: string; code: string; slug?: string }>)
      .map((b) => ({ name: b.name, code: b.code, slug: b.slug ?? b.code }))
      .sort((a, b) => a.name.localeCompare(b.name));
    _bankCache = { at: Date.now(), banks };
    return { ok: true as const, banks };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bank list failed";
    return { ok: false as const, error: msg };
  }
}

function tokens(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function namesMatch(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return false;
  const [shorter, longer] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const longerSet = new Set(longer);
  const matched = shorter.filter((t) => longerSet.has(t)).length;
  return matched >= 2 && matched / shorter.length >= 0.6;
}

export async function runVerifyKycPaystack(input: {
  accessToken: string;
  accountNumber: string;
  bankCode: string;
  bankName: string;
}) {
  try {
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(
      input.accessToken,
    );
    if (authErr || !authData.user)
      return { ok: false as const, error: "Please sign in again" };
    const userId = authData.user.id;

    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) return { ok: false as const, error: "Bank verification is not configured" };

    const { data: profile, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (profErr) return { ok: false as const, error: profErr.message };
    if (!profile?.full_name?.trim()) {
      return { ok: false as const, error: "Add your full name to your profile first" };
    }

    const res = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(input.accountNumber)}&bank_code=${encodeURIComponent(input.bankCode)}`,
      { headers: { Authorization: `Bearer ${secret}` } },
    );
    const json = (await res.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: { account_name: string; account_number: string };
    };
    if (!res.ok || !json.status || !json.data?.account_name) {
      return {
        ok: false as const,
        error: json.message || "Could not verify this account number with the bank",
      };
    }

    const resolvedName = json.data.account_name;
    if (!namesMatch(resolvedName, profile.full_name)) {
      return {
        ok: false as const,
        error: `Account name "${resolvedName}" does not match your registered name "${profile.full_name}". Use a bank account that belongs to you.`,
      };
    }

    const { error: updErr } = await supabaseAdmin
      .from("profiles")
      .update({
        bank_account_number: input.accountNumber,
        bank_name: input.bankName,
        bank_account_name: resolvedName,
        kyc_verified: true,
      })
      .eq("id", userId);
    if (updErr) return { ok: false as const, error: updErr.message };

    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      title: "✅ KYC Verified",
       message:
         "Your bank account was verified instantly. You can now request payouts.",
      type: "success",
    });

    await sendEventEmail({ type: "kyc_approved", userId }).catch((e) =>
      console.error("[runVerifyKycPaystack] email send failed", e),
    );

    return { ok: true as const, accountName: resolvedName };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    console.error("[runVerifyKycPaystack] unexpected", msg);
    return { ok: false as const, error: msg };
  }
}
