import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateBranchAdvisory, type BranchSituationType } from "@/lib/ai/domains/finance";
import type { TablesInsert } from "@/types/database.types";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITUATION_TITLE: Record<BranchSituationType, (branchName: string) => string> = {
  cash_low: (b) => `Peringatan Saldo Kas — ${b}`,
  no_project: (b) => `Pengingat: Segera Buka Proyek — ${b}`,
  no_sales: (b) => `Perhatian: Belum Ada Penjualan — ${b}`,
};

/**
 * Invoked daily by pg_cron (ai-branch-balance-advisory-daily, see
 * 0098/0099/0100 migrations) via net.http_post -- mirrors the no-shared-
 * secret, re-derive-everything-from-the-DB pattern of app/api/ai/whatsapp-
 * relay: this route only ever acts on employees.branch_id it looks up
 * itself, so a forged call can't target an arbitrary phone number.
 *
 * Each branch has its own alert_threshold (real monthly payroll + operating
 * cost), situation_type (cash_low / no_project / no_sales -- picks the AI
 * prompt, tone, and recipients), and reminder_interval_days (cooldown
 * between re-alerts -- most branches daily, Makassar every 2 days).
 * Jabodetabek's notify_dirops also routes its no_sales advisory to
 * Direktur Operasional in addition to its Kepala Cabang.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  const supabase = createAdminClient();

  const { data: allBalances, error: balancesError } = await supabase
    .from("finance_branch_balances")
    .select("branch_id, branch_name, saldo, alert_threshold, notify_dirops, situation_type, situation_note, reminder_interval_days");

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
    const situationType = balance.situation_type as BranchSituationType;
    const cooldownSince = new Date(Date.now() - balance.reminder_interval_days * 24 * 60 * 60 * 1000).toISOString();
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
      advisory = await generateBranchAdvisory({
        situationType,
        branchName: balance.branch_name,
        saldo: balance.saldo,
        thresholdAmount: balance.alert_threshold,
        dayOfMonth,
        situationNote: balance.situation_note,
      });
    } catch (err) {
      logger.error("branch-balance-advisory: AI generation failed", { branch: balance.branch_name, error: String(err) });
      continue;
    }

    const rows: TablesInsert<"mkc_notifications">[] = recipientIds.map((userId) => ({
      user_id: userId,
      type: "system",
      category: "branch_balance_alert",
      title: SITUATION_TITLE[situationType](balance.branch_name),
      body: advisory,
      link: "/dashboard",
      metadata: { branch_id: balance.branch_id, saldo: balance.saldo, threshold: balance.alert_threshold, situation_type: situationType },
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
