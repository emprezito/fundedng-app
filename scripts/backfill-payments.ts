/**
 * One-time backfill: reconciles ALL successful Squad transactions that have
 * no matching order in Supabase.
 *
 * Run once before enabling the 30-minute reconciliation cron to catch
 * any missed payments from before the cron was deployed.
 *
 * Usage:
 *   npx tsx scripts/backfill-payments.ts
 *
 * Environment variables needed:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SQUAD_SECRET_KEY, CRON_SECRET
 */

const SQUAD_SECRET = process.env.SQUAD_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SQUAD_SECRET || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing required env vars: SQUAD_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

import { createClient } from "@supabase/supabase-js";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface SquadTransaction {
  transaction_ref: string;
  transaction_amount: number;
  email: string;
  transaction_status: string;
  metadata?: Record<string, string>;
  meta?: Record<string, string>;
}

async function fetchAllSuccessTransactions(): Promise<SquadTransaction[]> {
  const all: SquadTransaction[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `https://api-d.squadco.com/transaction/list?perPage=100&page=${page}&transaction_status=success`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${SQUAD_SECRET}` },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Squad API error (${res.status}): ${text}`);
    }

    const json = await res.json();
    const transactions: SquadTransaction[] = json?.data?.transactions ?? [];
    all.push(...transactions);

    const total = json?.data?.total ?? 0;
    hasMore = all.length < total && transactions.length > 0;
    page++;
    console.log(`  Fetched page ${page - 1}: ${transactions.length} txns (total so far: ${all.length}/${total})`);
  }

  return all;
}

async function main() {
  console.log("Fetching all successful Squad transactions...");
  const transactions = await fetchAllSuccessTransactions();
  console.log(`Found ${transactions.length} total successful transactions`);

  let created = 0;
  let alreadyDelivered = 0;
  let missingMeta = 0;
  let errors = 0;

  for (const txn of transactions) {
    const ref = txn.transaction_ref;
    if (!ref) continue;

    // Check if order exists
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, user_id, challenge_id, status")
      .eq("paystack_reference", ref)
      .maybeSingle();

    if (existingOrder) {
      // Check if already delivered
      const { data: account } = await supabase
        .from("trader_accounts")
        .select("id")
        .eq("order_id", existingOrder.id)
        .maybeSingle();

      if (account) {
        alreadyDelivered++;
      } else {
        console.log(`  Order exists but NOT delivered: ${ref} (order: ${existingOrder.id})`);
        errors++;
      }
      continue;
    }

    // No order — try to reconstruct from metadata
    const meta = txn.metadata ?? txn.meta ?? {};
    const challengeId = meta.challenge_id;
    const userId = meta.user_id;

    if (!challengeId || !userId) {
      console.log(`  MISSING META — cannot reconstruct: ${ref} | ${txn.email} | ₦${txn.transaction_amount}`);
      missingMeta++;
      continue;
    }

    const { data: challenge } = await supabase
      .from("challenges")
      .select("id, name, account_size")
      .eq("id", challengeId)
      .maybeSingle();

    if (!challenge) {
      console.log(`  Challenge not found: ${challengeId} for ref ${ref}`);
      errors++;
      continue;
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        amount_paid: txn.transaction_amount,
        status: "paid",
        paystack_reference: ref,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error(`  FAILED to create order for ${ref}:`, orderErr?.message);
      errors++;
      continue;
    }

    console.log(`  ✅ Created order ${order.id} for ref ${ref} (${challenge.name})`);
    created++;
  }

  console.log("\n========== SUMMARY ==========");
  console.log(`Total transactions processed: ${transactions.length}`);
  console.log(`Already delivered:            ${alreadyDelivered}`);
  console.log(`Orders created:               ${created}`);
  console.log(`Missing metadata (manual):     ${missingMeta}`);
  console.log(`Errors:                       ${errors}`);
  console.log("==============================");
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
