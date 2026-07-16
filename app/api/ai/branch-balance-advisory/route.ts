import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBranchBalanceAdvisory } from "@/lib/ai/domains/finance";
import type { TablesInsert } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Placeholder threshold pending real per-branch payroll/operating-cost data
 * (see 0098_finance_expense_alerts_and_branch_balance.sql). Once HR/Finance
 * can supply an actual monthly obligation per branch, replace this constant
 * with a per-branch lookup.
 */
const BALANCE_ALERT_THRESHOLD = 15_000_000;

/** Don't re-alert the same branch more than once in this window. */
const RE_ALERT_COOLDOWN_HOURS = 24;

/**
 * Invoked daily by pg_cron (ai-branch-balance-advisory-check, see the same
 * migration) via net.http_post -- mirrors the no-shared-secret,
 * re-derive-everything-from-the-DB pattern of app/api/ai/whatsapp-relay:
 * this route only ever acts on employees.branch_id it looks up itself, so a
 * forged call can't target an arbitrary phone number.
 */
export async function POST() {
  const supabase = createAdminClient();

  const { data: balances, error: balancesError } = await supabase
    .from("finance_branch_balances")
    .select("branch_id, branch_name, saldo")
    .lt("saldo", BALANCE_ALERT_THRESHOLD);

  if (balancesError) {
    logger.error("branch-balance-advisory: failed to load finance_branch_balances", { error: balancesError.message });
    return NextResponse.json({ error: balancesError.message }, { status: 500 });
  }
  if (!balances?.length) {
    return NextResponse.json({ alerted: 0 });
  }

  const dayOfMonth = new Date().getDate();
  let alerted = 0;

  for (const balance of balances) {
    const cooldownSince = new Date(Date.now() - RE_ALERT_COOLDOWN_HOURS * 60 * 60 * 1000).toISOString();
    const { data: recentAlert } = await supabase
      .from("mkc_notifications")
      .select("id")
      .eq("category", "branch_balance_alert")
      .contains("metadata", { branch_id: balance.branch_id })
      .gte("created_at", cooldownSince)
      .limit(1);
    if (recentAlert?.length) continue;

    const { data: heads, error: headsError } = await supabase
      .from("employees")
      .select("id, roles!inner(key)")
      .eq("branch_id", balance.branch_id)
      .eq("roles.key", "kepala_cabang")
      .eq("employment_status", "active")
      .is("deleted_at", null);

    if (headsError || !heads?.length) continue;

    let advisory: string;
    try {
      advisory = await generateBranchBalanceAdvisory({
        branchName: balance.branch_name,
        saldo: balance.saldo,
        thresholdAmount: BALANCE_ALERT_THRESHOLD,
        dayOfMonth,
      });
    } catch (err) {
      logger.error("branch-balance-advisory: AI generation failed", { branch: balance.branch_name, error: String(err) });
      continue;
    }

    const rows: TablesInsert<"mkc_notifications">[] = heads.map((head) => ({
      user_id: head.id,
      type: "system",
      category: "branch_balance_alert",
      title: `Peringatan Saldo Kas — ${balance.branch_name}`,
      body: advisory,
      link: "/dashboard",
      metadata: { branch_id: balance.branch_id, saldo: balance.saldo, threshold: BALANCE_ALERT_THRESHOLD },
    }));

    const { error: insertError } = await supabase.from("mkc_notifications").insert(rows);
    if (insertError) {
      logger.error("branch-balance-advisory: failed to insert notification", { branch: balance.branch_name, error: insertError.message });
      continue;
    }
    alerted += rows.length;
  }

  return NextResponse.json({ alerted });
}
