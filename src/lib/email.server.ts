import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ADMIN_EMAIL = process.env.ADMIN_NOTIFICATION_EMAIL;
const FROM = "FundedNG <support@fundedng.fun>";
const SITE = "https://fundedng.fun";

function fmtNaira(n: number | null | undefined) {
  if (n == null) return "₦—";
  return "₦" + new Intl.NumberFormat("en-NG").format(Math.round(Number(n)));
}

function fmtUSD(n: number | null | undefined) {
  if (n == null) return "$—";
  return "$" + new Intl.NumberFormat("en-US").format(Math.round(Number(n)));
}

function fmtAmount(n: number | null | undefined, currency: string | null | undefined) {
  return currency === "USD" ? fmtUSD(n) : fmtNaira(n);
}

function firstName(name?: string | null) {
  if (!name) return "Trader";
  return name.trim().split(/\s+/)[0];
}

async function resendSend(payload: {
  to: string | string[];
  subject: string;
  html: string;
  reply_to?: string;
}) {
  if (!RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY missing — skipping send");
    return { ok: false, error: "RESEND_API_KEY missing" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        reply_to: payload.reply_to ?? "support@fundedng.fun",
      }),
    });
    const data = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      console.error("[email] resend error", res.status, data);
      return { ok: false, error: data?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, id: data?.id };
  } catch (e) {
    console.error("[email] send threw", e);
    return { ok: false, error: e instanceof Error ? e.message : "send failed" };
  }
}

/* ----------------------------- HTML shell ----------------------------- */

function shell(opts: { title: string; preview?: string; body: string }) {
  const preview = opts.preview ?? "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    opts.title,
  )}</title></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f1d18;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f6f5;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <tr><td style="background:#0f1d18;padding:22px 28px;">
        <div style="font-family:'Montserrat',-apple-system,sans-serif;font-weight:800;font-size:22px;color:#ffffff;letter-spacing:-0.5px;">
          Funded<span style="color:#1ec97e;">NG</span> <span style="font-size:14px;font-weight:600;color:#9ca3af;">🇳🇬</span>
        </div>
      </td></tr>
      <tr><td style="padding:28px;">${opts.body}</td></tr>
      <tr><td style="background:#0f1d18;padding:18px 28px;text-align:center;color:#9ca3af;font-size:12px;">
        <div style="color:#1ec97e;font-weight:700;font-size:13px;margin-bottom:6px;">If You Sabi Trade, We Sabi Pay. 🇳🇬</div>
        <div>— The FundedNG Team · <a href="${SITE}" style="color:#9ca3af;text-decoration:underline;">fundedng.fun</a></div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function btn(href: string, label: string) {
  return `<div style="margin:24px 0;"><a href="${href}" style="display:inline-block;background:#0a8f5a;color:#fff !important;text-decoration:none;padding:13px 26px;border-radius:10px;font-weight:700;font-family:'Montserrat',sans-serif;font-size:14px;letter-spacing:0.5px;">${escapeHtml(label)}</a></div>`;
}

function divider() {
  return `<div style="border-top:1px dashed #d1d5db;margin:18px 0;"></div>`;
}

function detailRow(label: string, value: string) {
  return `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:14px;"><span style="color:#6b7280;">${escapeHtml(label)}</span><span style="color:#0f1d18;font-weight:600;text-align:right;">${escapeHtml(value)}</span></div>`;
}

function h1(text: string) {
  return `<h1 style="font-family:'Montserrat',sans-serif;font-size:22px;font-weight:800;color:#0f1d18;margin:0 0 14px;">${escapeHtml(text)}</h1>`;
}

function p(text: string) {
  return `<p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 14px;">${text}</p>`;
}

/* --------------------------- Lookup helpers --------------------------- */

async function getUserEmail(userId: string): Promise<{ email: string | null; name: string | null }> {
  const [{ data: u }, { data: p }] = await Promise.all([
    supabaseAdmin.auth.admin.getUserById(userId),
    supabaseAdmin.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
  ]);
  return { email: u?.user?.email ?? null, name: (p as any)?.full_name ?? null };
}

async function sendAdminCopy(subject: string, html: string) {
  if (!ADMIN_EMAIL) return;
  await resendSend({ to: ADMIN_EMAIL, subject: `[Admin] ${subject}`, html });
}

/* ------------------------------- Events ------------------------------- */

export type EmailEvent =
  | { type: "welcome"; userId: string }
  | { type: "purchase_confirmed"; orderId: string }
  | { type: "mt5_delivered"; orderId: string; mt5Login: string; mt5Password: string; mt5Server: string }
  | { type: "phase1_passed"; accountId: string }
  | { type: "funded"; accountId: string }
  | { type: "payout_requested"; payoutId: string }
  | { type: "payout_approved"; payoutId: string }
  | { type: "payout_paid"; payoutId: string }
  | { type: "payout_rejected"; payoutId: string; reason?: string }
  | { type: "breached"; accountId: string; reason: string; shortHeldTrades?: Array<{ ticket: number; symbol: string; duration_seconds: number; close_time: string; profit: number }> }
  | { type: "kyc_approved"; userId: string }
  | { type: "phase_rejected"; accountId: string; reason: string; phaseType: "phase2" | "funded" };

export async function sendEventEmail(ev: EmailEvent): Promise<{ ok: boolean; error?: string }> {
  try {
    switch (ev.type) {
      case "welcome":
        return await welcome(ev.userId);
      case "purchase_confirmed":
        return await purchaseConfirmed(ev.orderId);
      case "mt5_delivered":
        return await mt5Delivered(ev.orderId, ev.mt5Login, ev.mt5Password, ev.mt5Server);
      case "phase1_passed":
        return await phase1Passed(ev.accountId);
      case "funded":
        return await funded(ev.accountId);
      case "payout_requested":
        return await payoutRequested(ev.payoutId);
      case "payout_approved":
        return await payoutApproved(ev.payoutId);
      case "payout_paid":
        return await payoutPaid(ev.payoutId);
      case "payout_rejected":
        return await payoutRejected(ev.payoutId, ev.reason ?? "Not specified.");
      case "breached":
        return await breached(ev.accountId, ev.reason, ev.shortHeldTrades);
      case "kyc_approved":
        return await kycApproved(ev.userId);
      case "phase_rejected":
        return await phaseRequestRejected(ev.accountId, ev.reason, ev.phaseType);
    }
  } catch (e) {
    console.error("[email] event failed", ev.type, e);
    return { ok: false, error: e instanceof Error ? e.message : "fail" };
  }
}

/* 1. Welcome */
async function welcome(userId: string) {
  const { email, name } = await getUserEmail(userId);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const subject = "Welcome to FundedNG 🇳🇬 — Trade Big. Get Paid.";
  const html = shell({
    title: subject,
    preview: "The best prop firm for 9ja traders.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`Welcome to <b>FundedNG</b> — The Best Prop Firm for 9ja Traders wey sabi trade.`) +
      p(`Your account has been created successfully. You're now part of a growing community of Nigerian traders getting funded and getting paid.`) +
      p(`<b>Here's what you can do next:</b><br>• Browse our challenge accounts starting from <b>₦7,500</b><br>• Pick a challenge that fits your trading style<br>• Pass the evaluation and get funded`) +
      p(`No dollar stress. No complicated rules. Just 3 fair rules and you're good to go.`) +
      btn(`${SITE}/buy`, "GET STARTED →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`New signup: ${name ?? email}`, shell({
    title: "New signup",
    body: h1("New signup") + detailRow("Name", name ?? "—") + detailRow("Email", email) + detailRow("User ID", userId),
  }));
  return r;
}

/* 2. Purchase confirmed */
async function purchaseConfirmed(orderId: string) {
  const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "order not found" };
  const { data: ch } = await supabaseAdmin.from("challenges").select("name, account_size, currency, price_naira").eq("id", (order as any).challenge_id).maybeSingle();
  const { email, name } = await getUserEmail((order as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const cc = (ch as any)?.currency;
  const subject = "Challenge Purchase Confirmed ✅ — FundedNG";
  const details =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin-bottom:10px;">ORDER DETAILS</div>` +
    detailRow("Challenge", (ch as any)?.name ?? "—") +
    detailRow("Account Size", fmtAmount((ch as any)?.account_size, cc)) +
    detailRow("Amount Paid", fmtAmount((order as any).amount_naira ?? (ch as any)?.price_naira, cc)) +
    detailRow("Order ID", String((order as any).id).slice(0, 8).toUpperCase()) +
    `</div>`;
  const html = shell({
    title: subject,
    preview: "Your MT5 login details are on the way.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`Your challenge purchase has been confirmed! 🎉`) +
      details +
      p(`<b>What happens next?</b><br>Your MT5 account credentials will be delivered to this email within 5 mins. Keep an eye on your inbox.`) +
      p(`Once you receive your login details, log in to MT5 and start trading toward your profit target.`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`New purchase: ${(ch as any)?.name ?? "Challenge"} · ${name ?? email}`, shell({
    title: "New purchase",
    body: h1("💰 New challenge purchase") + p(`Deliver MT5 credentials manually in /admin.`) + details + detailRow("Trader", name ?? "—") + detailRow("Email", email),
  }));
  return r;
}

/* 3. MT5 delivered */
async function mt5Delivered(orderId: string, login: string, password: string, server: string) {
  const { data: order } = await supabaseAdmin.from("orders").select("user_id, challenge_id").eq("id", orderId).maybeSingle();
  if (!order) return { ok: false, error: "order not found" };
  const { data: ch } = await supabaseAdmin.from("challenges").select("name, profit_target_percent, max_drawdown_percent, drawdown_type").eq("id", (order as any).challenge_id).maybeSingle();
  const { email, name } = await getUserEmail((order as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const subject = "Your MT5 Account is Ready 🎉 — Login Details Inside";
  const creds =
    `<div style="background:#0f1d18;border-radius:10px;padding:16px 18px;margin:18px 0;color:#fff;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#1ec97e;letter-spacing:1px;margin-bottom:10px;">MT5 LOGIN DETAILS</div>` +
    `<div style="font-size:14px;margin:6px 0;"><span style="color:#9ca3af;">Login:</span> <span style="font-family:monospace;font-weight:700;">${escapeHtml(login)}</span></div>` +
    `<div style="font-size:14px;margin:6px 0;"><span style="color:#9ca3af;">Password:</span> <span style="font-family:monospace;font-weight:700;">${escapeHtml(password)}</span></div>` +
    `<div style="font-size:14px;margin:6px 0;"><span style="color:#9ca3af;">Server:</span> <span style="font-family:monospace;font-weight:700;">${escapeHtml(server)}</span></div>` +
    `</div>`;
  const rules =
    `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:6px;padding:12px 14px;margin:14px 0;font-size:13px;color:#7c2d12;">` +
    `⚠️ <b>PLEASE CHANGE YOUR PASSWORD IMMEDIATELY.</b> We will not be responsible for any unauthorised trades on your account.</div>` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin:18px 0 8px;">YOUR CHALLENGE RULES</div>` +
    `<ul style="margin:0 0 14px 18px;padding:0;font-size:14px;color:#374151;line-height:1.7;">` +
    `<li>Profit Target: <b>${(ch as any)?.profit_target_percent ?? "—"}%</b></li>` +
    `<li>Max Total Drawdown: <b>${(ch as any)?.max_drawdown_percent ?? "—"}%</b> ${(ch as any)?.drawdown_type === "static_balance" ? "(static, based on closed balance)" : (ch as any)?.drawdown_type === "trailing_balance" ? "(trailing, based on closed balance — floating losses don't count)" : "(equity trailing from highest peak)"}</li>` +
    `<li>Anti-Scalping: <b>3-minute</b> minimum hold — 3 warnings, then breach on 4th</li>` +
    `<li>No Weekend Holding: close all positions before weekend market close</li>` +
    `</ul>`;
  const html = shell({
    title: subject,
    preview: "Your trading account is ready.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`Your FundedNG trading account is ready! Here are your login details:`) +
      creds +
      rules +
      btn(`${SITE}/rules`, "HOW TO LOGIN →") +
      p(`Good luck trader! We're rooting for you. 💪`),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Delivered MT5: ${login} → ${name ?? email}`, shell({
    title: "MT5 delivered",
    body: h1("MT5 account delivered") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + detailRow("Login", login) + detailRow("Server", server),
  }));
  return r;
}

/* 4. Phase 1 passed */
async function phase1Passed(accountId: string) {
  const { data: acc } = await supabaseAdmin.from("trader_accounts").select("user_id, starting_balance, currency, challenge_id").eq("id", accountId).maybeSingle();
  if (!acc) return { ok: false, error: "account not found" };
  const { data: ch } = await supabaseAdmin.from("challenges").select("profit_target_percent, max_drawdown_percent").eq("id", (acc as any).challenge_id).maybeSingle();
  const { email, name } = await getUserEmail((acc as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const cc = (acc as any).currency;
  const subject = "🏆 Phase 1 Passed — You're Halfway There!";
  const details =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin-bottom:10px;">PHASE 2 DETAILS</div>` +
    detailRow("Account Size", fmtAmount((acc as any).starting_balance, cc)) +
    detailRow("Profit Target", `${(ch as any)?.profit_target_percent ?? "—"}%`) +
    detailRow("Max Total Drawdown", `${(ch as any)?.max_drawdown_percent ?? "—"}%`) +
    `</div>`;
  const html = shell({
    title: subject,
    preview: "Phase 2 is now active on your dashboard.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`<b>CONGRATULATIONS! 🎉</b>`) +
      p(`You have successfully passed Phase 1 of your FundedNG challenge. Your trading has been verified and Phase 2 is now active on your dashboard.`) +
      details +
      p(`Keep the same discipline that got you here. Phase 2 is your final step before becoming a fully funded FundedNG trader.`) +
      p(`Stay focused. Stay consistent. You've got this. 💪`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Phase 1 passed: ${name ?? email}`, shell({
    title: "Phase 1 passed",
    body: h1("Phase 1 passed") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + detailRow("Account size", fmtAmount((acc as any).starting_balance, cc)),
  }));
  return r;
}

/* 5. Funded */
async function funded(accountId: string) {
  const { data: acc } = await supabaseAdmin.from("trader_accounts").select("user_id, starting_balance, currency").eq("id", accountId).maybeSingle();
  if (!acc) return { ok: false, error: "account not found" };
  const { email, name } = await getUserEmail((acc as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const cc = (acc as any).currency;
  const subject = "🎉 You're a Funded Trader! Welcome to the FundedNG Family";
  const details =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin-bottom:10px;">FUNDED ACCOUNT DETAILS</div>` +
    detailRow("Account Size", fmtAmount((acc as any).starting_balance, cc)) +
    detailRow("Profit Split", "80% in your favour") +
    detailRow("First Payout", "After 10% KYC withdrawal") +
    detailRow("Payout Schedule", "Every 7 days") +
    `</div>`;
  const how =
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin:18px 0 8px;">HOW TO REQUEST A PAYOUT</div>` +
    `<ol style="margin:0 0 14px 20px;padding:0;font-size:14px;color:#374151;line-height:1.7;">` +
    `<li>Log in to your dashboard</li><li>Go to the Payouts tab</li><li>Enter your bank details and amount</li><li>We process within 24hrs</li></ol>`;
  const html = shell({
    title: subject,
    preview: "Your funded account is now active.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`<b>YOU DID IT! 🎊🇳🇬</b>`) +
      p(`You have successfully passed all evaluation phases and are now a fully funded FundedNG trader. Your funded account is now active.`) +
      details +
      how +
      p(`Trade well and get paid. You've earned it. 🏆`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Funded: ${name ?? email}`, shell({
    title: "Funded",
    body: h1("Trader funded") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + detailRow("Account size", fmtAmount((acc as any).starting_balance, cc)),
  }));
  return r;
}

/* 6. Payout requested */
async function payoutRequested(payoutId: string) {
  const { data: po } = await supabaseAdmin.from("payouts").select("*").eq("id", payoutId).maybeSingle();
  if (!po) return { ok: false, error: "payout not found" };
  const { email, name } = await getUserEmail((po as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const bank = (po as any).bank_details ?? {};
  const method = `${bank.bank_name ?? "Bank"} · ${bank.account_number ?? ""}`;
  const subject = "Payout Request Received 💸 — FundedNG";
  const details =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin-bottom:10px;">PAYOUT DETAILS</div>` +
    detailRow("Amount Requested", fmtNaira((po as any).amount_naira)) +
    detailRow("Payment Method", method) +
    detailRow("Request Date", new Date((po as any).created_at).toLocaleDateString("en-NG")) +
    detailRow("Processing Time", "24hrs") +
    `</div>`;
  const html = shell({
    title: subject,
    preview: "We have received your payout request.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`We have received your payout request. Here are the details:`) +
      details +
      p(`Our team will review and process your payout within 24hrs. You will receive a confirmation email once payment has been sent.`) +
      p(`If you have any questions contact us at <a href="mailto:support@fundedng.fun" style="color:#0a8f5a;">support@fundedng.fun</a>`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Payout request: ${fmtNaira((po as any).amount_naira)} · ${name ?? email}`, shell({
    title: "Payout request",
    body: h1("💸 New payout request") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + details,
  }));
  return r;
}

/* 7. Payout approved */
async function payoutApproved(payoutId: string) {
  const { data: po } = await supabaseAdmin.from("payouts").select("*").eq("id", payoutId).maybeSingle();
  if (!po) return { ok: false, error: "payout not found" };
  const { email, name } = await getUserEmail((po as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const bank = (po as any).bank_details ?? {};
  const method = `${bank.bank_name ?? "Bank"} · ${bank.account_number ?? ""}`;
  const subject = "✅ Payout Approved — Payment On Its Way!";
  const details =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin-bottom:10px;">PAYMENT DETAILS</div>` +
    detailRow("Amount Approved", fmtNaira((po as any).amount_naira)) +
    detailRow("Payment Method", method) +
    detailRow("Expected Arrival", "24hrs") +
    `</div>`;
  const html = shell({
    title: subject,
    preview: "Your payout has been approved.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`Great news! Your payout has been approved and payment is on its way. 🎉`) +
      details +
      p(`Once you receive your payment, we'd love for you to share your experience with the trading community. Your success story inspires other Nigerian traders! 🇳🇬`) +
      p(`Ready to keep trading? Your account balance has been reset and you can continue toward your next payout.`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Payout approved: ${fmtNaira((po as any).amount_naira)} · ${name ?? email}`, shell({
    title: "Payout approved",
    body: h1("Payout approved") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + details,
  }));
  return r;
}

/* 8. Payout paid */
async function payoutPaid(payoutId: string) {
  const { data: po } = await supabaseAdmin.from("payouts").select("*").eq("id", payoutId).maybeSingle();
  if (!po) return { ok: false, error: "payout not found" };
  const { email, name } = await getUserEmail((po as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const bank = (po as any).bank_details ?? {};
  const method = `${bank.bank_name ?? "Bank"} · ${bank.account_number ?? ""}`;
  const subject = "💵 Payout Paid — Payment Sent Successfully!";
  const details =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#0a8f5a;letter-spacing:1px;margin-bottom:10px;">PAYMENT DETAILS</div>` +
    detailRow("Amount Paid", fmtNaira((po as any).amount_naira)) +
    detailRow("Payment Method", method) +
    detailRow("Date Paid", new Date((po as any).processed_at ?? (po as any).updated_at ?? new Date()).toLocaleDateString("en-NG")) +
    `</div>`;
  const html = shell({
    title: subject,
    preview: "Your payout has been sent.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`Your payout has been sent successfully! 🎉`) +
      p(`The amount has been transferred to your bank account. It should reflect in your account shortly depending on your bank's processing time.`) +
      details +
      p(`Congratulations on your successful payout! Keep up the great trading and we look forward to processing more payouts for you. 🇳🇬`) +
      p(`If you have any questions contact us at <a href="mailto:support@fundedng.fun" style="color:#0a8f5a;">support@fundedng.fun</a>`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Payout paid: ${fmtNaira((po as any).amount_naira)} · ${name ?? email}`, shell({
    title: "Payout paid",
    body: h1("Payout paid") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + details,
  }));
  return r;
}

/* 9. Payout rejected */
async function payoutRejected(payoutId: string, reason: string) {
  const { data: po } = await supabaseAdmin.from("payouts").select("*").eq("id", payoutId).maybeSingle();
  if (!po) return { ok: false, error: "payout not found" };
  const { email, name } = await getUserEmail((po as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const subject = "Payout Request Update — Action Required";
  const reasonBox =
    `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:12px 14px;margin:14px 0;font-size:13px;color:#7f1d1d;">` +
    `<div style="font-weight:700;margin-bottom:4px;">REASON</div>${escapeHtml(reason)}</div>`;
  const html = shell({
    title: subject,
    preview: "Your payout request needs attention.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`We have reviewed your payout request and unfortunately it cannot be processed at this time.`) +
      reasonBox +
      p(`<b>Common reasons for payout rejection include:</b><br>• Incomplete KYC verification<br>• Bank details mismatch<br>• Minimum payout amount not reached<br>• Outstanding rule violations`) +
      p(`If you believe this is an error or need clarification, please contact us at <a href="mailto:support@fundedng.fun" style="color:#0a8f5a;">support@fundedng.fun</a> and we will resolve it promptly.`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Payout rejected: ${name ?? email}`, shell({
    title: "Payout rejected",
    body: h1("Payout rejected") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + detailRow("Amount", fmtNaira((po as any).amount_naira)) + p(`<b>Reason:</b> ${escapeHtml(reason)}`),
  }));
  return r;
}

/* 10. Account breached */
async function breached(accountId: string, reason: string, shortHeldTrades?: Array<{ ticket: number; symbol: string; duration_seconds: number; close_time: string; profit: number }>) {
  const { data: acc } = await supabaseAdmin.from("trader_accounts").select("user_id, mt5_login").eq("id", accountId).maybeSingle();
  if (!acc) return { ok: false, error: "account not found" };
  const { email, name } = await getUserEmail((acc as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const subject = "Account Update — Challenge Ended";
  const reasonBox =
    `<div style="background:#f9fafb;border-radius:10px;padding:16px 18px;margin:18px 0;">` +
    `<div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#dc2626;letter-spacing:1px;margin-bottom:10px;">BREACH DETAILS</div>` +
    detailRow("Reason", reason) +
    detailRow("Date", new Date().toLocaleDateString("en-NG")) +
    `</div>`;
  const tradesTable = shortHeldTrades?.length
    ? `<div style="margin:18px 0;">
        <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:12px;color:#dc2626;letter-spacing:1px;margin-bottom:10px;">SHORT-HELD TRADES</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="background:#f3f4f6;">
              <th style="text-align:left;padding:6px 8px;color:#6b7280;">Ticket</th>
              <th style="text-align:left;padding:6px 8px;color:#6b7280;">Symbol</th>
              <th style="text-align:left;padding:6px 8px;color:#6b7280;">Duration</th>
              <th style="text-align:left;padding:6px 8px;color:#6b7280;">Closed (WAT)</th>
              <th style="text-align:right;padding:6px 8px;color:#6b7280;">P&L</th>
            </tr>
          </thead>
          <tbody>
            ${shortHeldTrades.map((t, i) => {
              const watDate = new Date(new Date(t.close_time).getTime() + 3600000).toLocaleString("en-NG");
              const bg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
              return `<tr style="background:${bg};">
                <td style="padding:6px 8px;font-family:monospace;">#${t.ticket}</td>
                <td style="padding:6px 8px;font-weight:600;">${t.symbol}</td>
                <td style="padding:6px 8px;">${t.duration_seconds}s</td>
                <td style="padding:6px 8px;">${watDate}</td>
                <td style="padding:6px 8px;text-align:right;color:${t.profit >= 0 ? "#16a34a" : "#dc2626"};">${t.profit >= 0 ? "+" : ""}${t.profit.toFixed(2)}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`
    : "";
  const html = shell({
    title: subject,
    preview: "Your challenge has ended.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`We regret to inform you that your FundedNG challenge account has been terminated.`) +
      reasonBox +
      tradesTable +
      p(`Every great trader faces setbacks. What separates the best is how they respond. Review what happened, adjust your strategy and come back stronger.`) +
      p(`Ready to try again? Use code <b style="background:#fef3c7;padding:2px 8px;border-radius:4px;">RETRY20</b> for 20% off your next challenge.`) +
      btn(`${SITE}/buy`, "START FRESH →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`Breached: ${name ?? email}`, shell({
    title: "Account breached",
    body: h1("Account breached") + detailRow("Trader", name ?? "—") + detailRow("Email", email) + detailRow("MT5 Login", (acc as any).mt5_login ?? "—") + p(`<b>Reason:</b> ${escapeHtml(reason)}`),
  }));
  return r;
}

/* 11. KYC approved */
async function kycApproved(userId: string) {
  const { email, name } = await getUserEmail(userId);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const subject = "Identity Verified ✅ — You're Now Eligible for Payouts";
  const html = shell({
    title: subject,
    preview: "Your KYC has been approved.",
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`Your identity has been successfully verified! ✅`) +
      p(`You are now fully KYC verified on FundedNG which means:<br>• You can request payouts from your funded account<br>• Your account has full withdrawal privileges<br>• You're part of our verified trader community`) +
      p(`To request your first payout simply log in to your dashboard and go to the Payouts tab.`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`KYC approved: ${name ?? email}`, shell({
    title: "KYC approved",
    body: h1("KYC approved") + detailRow("Trader", name ?? "—") + detailRow("Email", email),
  }));
  return r;
}

/* 12. Phase request rejected */
async function phaseRequestRejected(accountId: string, reason: string, phaseType: "phase2" | "funded") {
  const { data: acc } = await supabaseAdmin.from("trader_accounts").select("user_id, mt5_login, starting_balance, challenge_id").eq("id", accountId).maybeSingle();
  if (!acc) return { ok: false, error: "account not found" };
  const { email, name } = await getUserEmail((acc as any).user_id);
  if (!email) return { ok: false, error: "no email" };
  const fn = firstName(name);
  const phaseLabel = phaseType === "phase2" ? "Phase 2" : "Funded";
  const subject = `${phaseLabel} Request Update — FundedNG`;
  const reasonBox =
    `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:6px;padding:12px 14px;margin:14px 0;font-size:13px;color:#7f1d1d;">` +
    `<div style="font-weight:700;margin-bottom:4px;">REASON</div>${escapeHtml(reason)}</div>`;
  const html = shell({
    title: subject,
    preview: `Your ${phaseLabel.toLowerCase()} request needs attention.`,
    body:
      h1(`Hi ${escapeHtml(fn)},`) +
      p(`We have reviewed your request to advance to <b>${escapeHtml(phaseLabel)}</b> and unfortunately it cannot be approved at this time.`) +
      reasonBox +
      p(`Don't be discouraged — keep trading and you can request again once you're ready. Focus on the rules and consistency.`) +
      p(`If you believe this is an error or need clarification, please contact us at <a href="mailto:support@fundedng.fun" style="color:#0a8f5a;">support@fundedng.fun</a> and we will resolve it promptly.`) +
      btn(`${SITE}/dashboard`, "VIEW DASHBOARD →"),
  });
  const r = await resendSend({ to: email, subject, html });
  await sendAdminCopy(`${phaseLabel} request rejected: ${name ?? email}`, shell({
    title: `${phaseLabel} request rejected`,
    body: h1(`${phaseLabel} request rejected`) + detailRow("Trader", name ?? "—") + detailRow("Email", email) + detailRow("MT5 Login", (acc as any).mt5_login ?? "—") + p(`<b>Reason:</b> ${escapeHtml(reason)}`),
  }));
  return r;
}

// keep this unused import-free
export const _divider = divider;