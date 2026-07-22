"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { generateLearningInsight, type ContentPerformanceMetrics } from "@/lib/ai/domains/kontenai-learning";
import { createClient } from "@/lib/supabase/server";
import { listKontenAiAssetsByIds } from "@/repositories/kontenai-assets.repository";
import {
  createKontenAiContentPerformance,
  listKontenAiContentPerformance,
  type KontenAiContentPerformanceWithContext,
} from "@/repositories/kontenai-content-performance.repository";
import { getKontenAiCreativeBrief } from "@/repositories/kontenai-creative-briefs.repository";
import { listKontenAiPublishSchedules, type KontenAiPublishScheduleWithContext } from "@/repositories/kontenai-publish-schedules.repository";
import { getKontenAiRenderJob } from "@/repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "@/repositories/kontenai-storyboards.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiContentPerformanceRow } from "@/types/domain";

const LEARNING_ENGINE_PATH = "/kontenai/learning-engine";

/**
 * Step 1's candidate list: every publish schedule ever created. Publishing
 * Engine's platform adapters are still stubs (Sprint 7), so a schedule
 * rarely reaches a real 'published' status automatically -- in practice the
 * team posts manually outside the system and logs the resulting metrics
 * back here, so schedules of any status are valid candidates to log
 * performance against.
 */
export async function listPublishSchedulesForLearningAction(): Promise<KontenAiPublishScheduleWithContext[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiPublishSchedules(supabase);
}

export interface ContentContext {
  storyboardTitle: string;
  sceneCount: number;
  totalDurationSeconds: number;
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
  productProject: string;
  platform: string;
  assets: { id: string; title: string; assetType: string; aiCategory: string | null }[];
}

/** Step 3: traces publish_schedule -> render_job -> storyboard -> creative_brief -> used assets, so the log form and AI insight both have real production context to work with. */
export async function getContentContextAction(publishScheduleId: string): Promise<ActionResult<ContentContext>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const { data: scheduleRow, error } = await supabase
      .from("kontenai_publish_schedules")
      .select("platform, render_job_id")
      .eq("id", publishScheduleId)
      .single();
    if (error) throw error;

    const renderJob = await getKontenAiRenderJob(supabase, scheduleRow.render_job_id);
    const storyboard = await getKontenAiStoryboard(supabase, renderJob.storyboard_id);
    const brief = await getKontenAiCreativeBrief(supabase, storyboard.creative_brief_id);

    const assetIds = [...new Set(storyboard.scenes.map((scene) => scene.selectedAssetId).filter((id): id is string => Boolean(id)))];
    const assets = await listKontenAiAssetsByIds(supabase, assetIds);

    return actionSuccess({
      storyboardTitle: storyboard.title,
      sceneCount: storyboard.scenes.length,
      totalDurationSeconds: storyboard.total_duration_seconds,
      bigIdea: brief.big_idea,
      hook: brief.hook,
      keyMessage: brief.key_message,
      targetEmotion: brief.target_emotion,
      cta: brief.cta,
      contentAngle: brief.content_angle,
      productProject: brief.product_project,
      platform: scheduleRow.platform,
      assets: assets.map((asset) => ({ id: asset.id, title: asset.title, assetType: asset.assetType, aiCategory: asset.aiCategory })),
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal memuat konteks konten");
  }
}

/** Steps 4-5: generates the AI insight + next-content recommendations, reasoning over the logged metrics and the content's real Creative Brief/storyboard/asset context. Not persisted yet -- a preview before saving. */
export async function generateLearningInsightAction(
  publishScheduleId: string,
  metrics: ContentPerformanceMetrics,
): Promise<ActionResult<Awaited<ReturnType<typeof generateLearningInsight>>>> {
  const contextResult = await getContentContextAction(publishScheduleId);
  if (!contextResult.success) return actionError(contextResult.error ?? "Gagal memuat konteks konten");
  const context = contextResult.data!;

  try {
    const assetSummary = context.assets.map((asset) => `${asset.title}${asset.aiCategory ? ` (${asset.aiCategory})` : ""}`).join(", ");

    const result = await generateLearningInsight({
      platform: context.platform,
      productProject: context.productProject,
      metrics,
      bigIdea: context.bigIdea,
      hook: context.hook,
      keyMessage: context.keyMessage,
      targetEmotion: context.targetEmotion,
      cta: context.cta,
      contentAngle: context.contentAngle,
      sceneCount: context.sceneCount,
      totalDurationSeconds: context.totalDurationSeconds,
      assetSummary,
    });

    return actionSuccess(result);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghasilkan AI Insight");
  }
}

export interface SaveContentPerformanceActionInput {
  publishScheduleId: string;
  metrics: ContentPerformanceMetrics;
  insight: string;
  recommendedHook: string;
  recommendedDurationSeconds: number | null;
  recommendedCta: string;
  recommendedVisual: string;
  recommendedTargetEmotion: string;
}

/** Step 6: persists the logged metrics + AI insight/recommendations together. */
export async function saveContentPerformanceAction(input: SaveContentPerformanceActionInput): Promise<ActionResult<KontenAiContentPerformanceRow>> {
  const session = await requireKontenAiAccess();

  if (!input.insight.trim()) return actionError("AI Insight tidak boleh kosong -- generate insight terlebih dahulu");

  const supabase = await createClient();
  try {
    const record = await createKontenAiContentPerformance(supabase, {
      publishScheduleId: input.publishScheduleId,
      views: input.metrics.views,
      reach: input.metrics.reach,
      likes: input.metrics.likes,
      comments: input.metrics.comments,
      shares: input.metrics.shares,
      saves: input.metrics.saves,
      ctr: input.metrics.ctr,
      leads: input.metrics.leads,
      aiInsight: input.insight,
      recommendedHook: input.recommendedHook,
      recommendedDurationSeconds: input.recommendedDurationSeconds,
      recommendedCta: input.recommendedCta,
      recommendedVisual: input.recommendedVisual,
      recommendedTargetEmotion: input.recommendedTargetEmotion,
      createdBy: session.userId,
    });

    revalidatePath(LEARNING_ENGINE_PATH);
    return actionSuccess(record);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menyimpan performa konten");
  }
}

/** Learning Dashboard's data source. */
export async function listContentPerformanceAction(): Promise<KontenAiContentPerformanceWithContext[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiContentPerformance(supabase);
}
