import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiContentPerformanceRow } from "@/types/domain";

export interface KontenAiContentPerformanceWithContext extends KontenAiContentPerformanceRow {
  publishSchedule: {
    platform: string;
    caption: string;
    renderJob: { storyboard: { title: string } | null } | null;
  } | null;
}

const SELECT_COLUMNS =
  "id, publish_schedule_id, views, reach, likes, comments, shares, saves, ctr, leads, ai_insight, recommended_hook, recommended_duration_seconds, recommended_cta, recommended_visual, recommended_target_emotion, created_by, created_at, updated_at, publishSchedule:publish_schedule_id(platform, caption, renderJob:render_job_id(storyboard:storyboard_id(title)))";

export interface CreateKontenAiContentPerformanceInput {
  publishScheduleId: string;
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  ctr: number | null;
  leads: number | null;
  aiInsight: string;
  recommendedHook: string;
  recommendedDurationSeconds: number | null;
  recommendedCta: string;
  recommendedVisual: string;
  recommendedTargetEmotion: string;
  createdBy: string;
}

export async function createKontenAiContentPerformance(
  supabase: TypedSupabaseClient,
  input: CreateKontenAiContentPerformanceInput,
): Promise<KontenAiContentPerformanceRow> {
  const { data, error } = await supabase
    .from("kontenai_content_performance")
    .insert({
      publish_schedule_id: input.publishScheduleId,
      views: input.views,
      reach: input.reach,
      likes: input.likes,
      comments: input.comments,
      shares: input.shares,
      saves: input.saves,
      ctr: input.ctr,
      leads: input.leads,
      ai_insight: input.aiInsight,
      recommended_hook: input.recommendedHook,
      recommended_duration_seconds: input.recommendedDurationSeconds,
      recommended_cta: input.recommendedCta,
      recommended_visual: input.recommendedVisual,
      recommended_target_emotion: input.recommendedTargetEmotion,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiContentPerformanceRow;
}

/** Learning Dashboard's data source -- every performance record + AI insight ever logged, newest first. */
export async function listKontenAiContentPerformance(supabase: TypedSupabaseClient, limit = 100): Promise<KontenAiContentPerformanceWithContext[]> {
  const { data, error } = await supabase.from("kontenai_content_performance").select(SELECT_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as KontenAiContentPerformanceWithContext[];
}
