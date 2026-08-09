import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEventEmail } from "@/lib/email.server";

export const Route = createFileRoute("/api/verify-bank")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          const token = authHeader?.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length).trim()
            : null;
          if (!token) {
            return Response.json({ error: "Not authenticated" }, { status: 401 });
          }
          const { data: userData, error: authErr } = await supabaseAdmin.auth.getUser(token);
          if (authErr || !userData?.user) {
            return Response.json({ error: "Please sign in again" }, { status: 401 });
          }
          const userId = userData.user.id;

          const body = (await request.json().catch(() => ({}))) as {
            bank_code?: string;
            account_number?: string;
            bank_name?: string;
          };
          const bankCode = body.bank_code?.trim();
          const accountNumber = body.account_number?.replace(/\s+/g, "");
          const bankName = body.bank_name?.trim() ?? "";

          if (!bankCode || !accountNumber) {
            return Response.json({ error: "bank_code and account_number are required" }, { status: 400 });
          }
          if (!/^\d{10}$/.test(accountNumber)) {
            return Response.json({ error: "Account number must be 10 digits" }, { status: 400 });
          }

          const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
          if (!paystackSecret) {
            return Response.json({ error: "Bank verification is not configured" }, { status: 503 });
          }

          const lookupRes = await fetch("https://api.paystack.co/bank/resolve", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${paystackSecret}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ bank_code: bankCode, account_number: accountNumber }),
          });
          const lookupJson = (await lookupRes.json().catch(() => ({}))) as {
            status?: boolean;
            message?: string;
            data?: { account_name: string; account_number: string };
          };

          if (!lookupRes.ok || !lookupJson.status || !lookupJson.data?.account_name) {
            return Response.json({
              error: lookupJson.message || "Could not verify this account number with the bank",
            }, { status: 400 });
          }

          const returnedName: string = lookupJson.data.account_name;

          const { data: profile, error: profErr } = await supabaseAdmin
            .from("profiles")
            .select("full_name")
            .eq("id", userId)
            .single();

          if (profErr || !profile?.full_name?.trim()) {
            return Response.json({ error: "No name on your account to match against" }, { status: 400 });
          }

          const registeredParts = profile.full_name.toUpperCase().trim().split(/\s+/).sort();
          const returnedParts = returnedName.toUpperCase().trim().split(/\s+/).sort();
          const isMatch = registeredParts.every((part) =>
            returnedParts.some((rp) => rp.includes(part) || part.includes(rp)),
          );

          if (!isMatch) {
            return Response.json({
              error: `Name mismatch. Bank returned "${returnedName}" but your account name is "${profile.full_name}".`,
            }, { status: 400 });
          }

          const { error: updErr } = await supabaseAdmin
            .from("profiles")
            .update({
              kyc_verified: true,
              bank_account_number: accountNumber,
              bank_name: bankName,
              bank_account_name: returnedName,
            })
            .eq("id", userId);

          if (updErr) {
            return Response.json({ error: updErr.message }, { status: 500 });
          }

          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            title: "✅ KYC Verified",
            message: "Your bank account was verified instantly. You can now request payouts.",
            type: "success",
          });

          await sendEventEmail({ type: "kyc_approved", userId }).catch((e) =>
            console.error("[verify-bank] email send failed", e),
          );

          return Response.json({ ok: true, account_name: returnedName });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Verification failed";
          console.error("[verify-bank] unexpected", msg);
          return Response.json({ error: msg }, { status: 500 });
        }
      },
    },
  },
});
