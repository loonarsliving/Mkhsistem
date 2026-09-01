"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  createCompetitorAccount,
  createCompetitorContentLog,
  deactivateCompetitorAccount,
  getLatestLeaseholdCompetitorComparison,
  getLatestMonthlyReport,
  getLatestWeeklyEvaluation,
  listCompetitorAccounts,
  listCompetitorContentLogs,
  listHashtagBank,
  listRecentAccountSnapshots,
  listWeeklyEvaluations,
  type CompetitorFocus,
} from "@/repositories/social.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { createCompetitorAccountSchema, createCompetitorContentLogSchema, type CreateCompetitorAccountInput, type CreateCompetitorContentLogInput } from "../schemas/social.schema";

/**
 * social_competitor_accounts (0125) now spans all three product lines --
 * leasehold_sales/occupancy stay under content_planner.*, beauty under
 * loonars_beauty.* (same product-line permission split already enforced
 * for the knowledge bank, 0117). Every action below takes the focus
 * explicitly from the caller (the UI always knows which tab it's on) and
 * checks the matching permission -- RLS enforces the same split
 * server-side as defense in depth.
 */
async function requireCompetitorPermission(focus: CompetitorFocus, level: "view" | "manage") {
  return requirePermission(focus === "beauty" ? `loonars_beauty.${level}` : `content_planner.${level}`);
}

export async function listCompetitorAccountsAction(focus: CompetitorFocus) {
  await requireCompetitorPermission(focus, "view");
  const supabase = await createClient();
  return listCompetitorAccounts(supabase, focus);
}

export async function listCompetitorContentLogsAction(focus: CompetitorFocus, competitorAccountId?: string) {
  await requireCompetitorPermission(focus, "view");
  const supabase = await createClient();
  return listCompetitorContentLogs(supabase, focus, competitorAccountId);
}

export async function listWeeklyContentAuditsAction() {
  await requirePermission("content_planner.view");
  const supabase = await createClient();
  return listWeeklyEvaluations(supabase, 12);
}

export async function getContentPlannerOverviewAction() {
  await requirePermission("content_planner.view");
  const supabase = await createClient();
  const [instagramSnapshots, tiktokSnapshots, weeklyEvaluation] = await Promise.all([
    listRecentAccountSnapshots(supabase, "instagram", 1),
    listRecentAccountSnapshots(supabase, "tiktok", 1),
    getLatestWeeklyEvaluation(supabase),
  ]);
  return {
    instagram: instagramSnapshots[0] ?? null,
    tiktok: tiktokSnapshots[0] ?? null,
    weeklyEvaluation,
  };
}

export async function createCompetitorAccountAction(input: CreateCompetitorAccountInput): Promise<ActionResult> {
  const parsed = createCompetitorAccountSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  const session = await requireCompetitorPermission(parsed.data.contentFocus, "manage");

  const supabase = await createClient();
  try {
    await createCompetitorAccount(supabase, {
      platform: parsed.data.platform,
      handle: parsed.data.handle,
      display_name: parsed.data.displayName || null,
      notes: parsed.data.notes || null,
      content_focus: parsed.data.contentFocus,
      source: "manual",
      created_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menambahkan kompetitor");
  }
  revalidatePath("/markom/content-planner");
  return actionSuccess();
}

export async function deactivateCompetitorAccountAction(id: string, focus: CompetitorFocus): Promise<ActionResult> {
  await requireCompetitorPermission(focus, "manage");
  const supabase = await createClient();
  try {
    await deactivateCompetitorAccount(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus kompetitor");
  }
  revalidatePath("/markom/content-planner");
  return actionSuccess();
}

/** Enqueues an on-demand AI competitor discovery run (0125) via the SECURITY DEFINER RPC -- the automatic weekly run (all 3 foci) still happens regardless. */
export async function triggerCompetitorDiscoveryAction(focus: CompetitorFocus): Promise<ActionResult> {
  await requireCompetitorPermission(focus, "manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("markom_request_competitor_discovery", { p_focus: focus });
  if (error) return actionError(error.message);
  return actionSuccess();
}

export async function getLatestCompetitorComparisonAction() {
  await requirePermission("content_planner.view");
  const supabase = await createClient();
  return getLatestLeaseholdCompetitorComparison(supabase);
}

/** Enqueues an on-demand comparison run (ai_job_queue) via the SECURITY DEFINER RPC -- same manual-trigger pattern as markom_request_ads_research. The automatic Monday run still happens regardless. */
export async function triggerCompetitorComparisonAction(): Promise<ActionResult> {
  await requirePermission("content_planner.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("markom_request_leasehold_competitor_comparison");
  if (error) return actionError(error.message);
  return actionSuccess();
}

export async function createCompetitorContentLogAction(input: CreateCompetitorContentLogInput): Promise<ActionResult> {
  const parsed = createCompetitorContentLogSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  const session = await requireCompetitorPermission(parsed.data.focus, "manage");

  const supabase = await createClient();
  try {
    await createCompetitorContentLog(supabase, {
      competitor_account_id: parsed.data.competitorAccountId,
      content_url: parsed.data.contentUrl || null,
      content_type: parsed.data.contentType,
      hook: parsed.data.hook || null,
      duration_seconds: parsed.data.durationSeconds,
      caption: parsed.data.caption || null,
      hashtags: parsed.data.hashtags || null,
      engagement_notes: parsed.data.engagementNotes || null,
      logged_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mencatat konten kompetitor");
  }
  revalidatePath("/markom/content-planner");
  return actionSuccess();
}

/** Monthly rollup report (0251) -- generated automatically on the 1st of each month, property-only (leasehold_sales + occupancy share one account). */
export async function getLatestMonthlyReportAction() {
  await requirePermission("content_planner.view");
  const supabase = await createClient();
  return getLatestMonthlyReport(supabase);
}

/** Manual trigger for a fresh monthly rollup, same "run now instead of waiting for the schedule" pattern as triggerCompetitorComparisonAction. */
export async function triggerMonthlyReportAction(): Promise<ActionResult> {
  await requirePermission("content_planner.manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("markom_request_monthly_report");
  if (error) return actionError(error.message);
  return actionSuccess();
}

export async function listHashtagBankAction(focus: CompetitorFocus, platform: "instagram" | "tiktok") {
  await requireCompetitorPermission(focus, "view");
  const supabase = await createClient();
  return listHashtagBank(supabase, focus, platform);
}

/** Manual trigger for a fresh hashtag bank for one (focus, platform) -- automatic weekly refresh covers all 6 combos regardless. */
export async function triggerHashtagBankRefreshAction(focus: CompetitorFocus, platform: "instagram" | "tiktok"): Promise<ActionResult> {
  await requireCompetitorPermission(focus, "manage");
  const supabase = await createClient();
  const { error } = await supabase.rpc("markom_request_hashtag_bank_refresh", { p_focus: focus, p_platform: platform });
  if (error) return actionError(error.message);
  return actionSuccess();
}
