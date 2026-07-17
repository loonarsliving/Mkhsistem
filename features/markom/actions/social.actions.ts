"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  createCompetitorAccount,
  createCompetitorContentLog,
  deactivateCompetitorAccount,
  getLatestWeeklyEvaluation,
  listCompetitorAccounts,
  listCompetitorContentLogs,
  listRecentAccountSnapshots,
  listWeeklyEvaluations,
} from "@/repositories/social.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { createCompetitorAccountSchema, createCompetitorContentLogSchema, type CreateCompetitorAccountInput, type CreateCompetitorContentLogInput } from "../schemas/social.schema";

export async function listCompetitorAccountsAction() {
  await requirePermission("content_planner.view");
  const supabase = await createClient();
  return listCompetitorAccounts(supabase);
}

export async function listCompetitorContentLogsAction(competitorAccountId?: string) {
  await requirePermission("content_planner.view");
  const supabase = await createClient();
  return listCompetitorContentLogs(supabase, competitorAccountId);
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
  const session = await requirePermission("content_planner.manage");
  const parsed = createCompetitorAccountSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await createCompetitorAccount(supabase, {
      platform: parsed.data.platform,
      handle: parsed.data.handle,
      display_name: parsed.data.displayName || null,
      notes: parsed.data.notes || null,
      created_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menambahkan kompetitor");
  }
  revalidatePath("/markom/content-planner");
  return actionSuccess();
}

export async function deactivateCompetitorAccountAction(id: string): Promise<ActionResult> {
  await requirePermission("content_planner.manage");
  const supabase = await createClient();
  try {
    await deactivateCompetitorAccount(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus kompetitor");
  }
  revalidatePath("/markom/content-planner");
  return actionSuccess();
}

export async function createCompetitorContentLogAction(input: CreateCompetitorContentLogInput): Promise<ActionResult> {
  const session = await requirePermission("content_planner.manage");
  const parsed = createCompetitorContentLogSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

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
