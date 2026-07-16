import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBranchBalanceAdvisory } from "@/lib/ai/domains/finance";
import type { TablesInsert } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Don't re-alert the same branch more than once in this window. */
const RE_ALERT_COOLDOWN_HOURS = 24;

/**
 * Invoked daily by pg_cron (ai-branch-balance-advisory-daily, see
 * 0098_finance_expense_alerts_and_branch_balance.sql /
 * 0099_branch_balance_thresholds_and_expense_alert_detail.sql) via
 * net.http_post -- mirrors the no-shared-secret, re-derive-everything-
 * from-the-DB pattern of app/api/ai/whatsapp-relay: this route only ever
 * acts on employees.branch_id it looks up itself, so a forged call can't
 * target an arbitrary phone number.
 *
 * Each branch has its own alert_threshold (its real monthly payroll +
 * operating cost, set by CFO) and an optional notify_dirops flag --
 * Jabodetabek also alerts Direktur Operasional, not just its Kepala Cabang.
 */
export async function POST() {
  const supabase = createAdminClient();

  const { data: allBalances, error: balancesError } = await supabase
    .from("finance_branch_balances")
    .select("branch_id, branch_name, saldo, alert_threshold, notify_dirops");

  if (balancesError) {
    logger.error("branch-balance-advisory: failed to load finance_branch_balances", { error: balancesError.message });
    return NextResponse.json({ error: balancesError.message }, { status: 500 });
  }

  const belowThreshold = (allBalances ?? []).filter((b) => b.saldo < b.alert_threshold);
  if (!belowThreshold.length) {
    return NextResponse.json({ alerted: 0 });
  }

  const dayOfMonth = new Date().getDate();
  let alerted = 0;

  for (const balance of belowThreshold) {
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

    let recipientIds = (heads ?? []).map((h) => h.id);

    if (balance.notify_dirops) {
      const { data: dirops } = await supabase
        .from("employees")
        .select("id, roles!inner(key)")
        .eq("roles.key", "direktur_operasional")
        .eq("employment_status", "active")
        .is("deleted_at", null);
      recipientIds = [...recipientIds, ...(dirops ?? []).map((d) => d.id)];
    }

    if (headsError || !recipientIds.length) continue;

    let advisory: string;
    try {
      advisory = await generateBranchBalanceAdvisory({
        branchName: balance.branch_name,
        saldo: balance.saldo,
        thresholdAmount: balance.alert_threshold,
        dayOfMonth,
      });
    } catch (err) {
      logger.error("branch-balance-advisory: AI generation failed", { branch: balance.branch_name, error: String(err) });
      continue;
    }

    const rows: TablesInsert<"mkc_notifications">[] = recipientIds.map((userId) => ({
      user_id: userId,
      type: "system",
      category: "branch_balance_alert",
      title: `Peringatan Saldo Kas — ${balance.branch_name}`,
      body: advisory,
      link: "/dashboard",
      metadata: { branch_id: balance.branch_id, saldo: balance.saldo, threshold: balance.alert_threshold },
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
