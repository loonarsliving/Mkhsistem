import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiOptimizationRecommendationRow } from "@/types/domain";

export interface CreateKontenAiOptimizationRecommendationInput {
  recommendedHook: string;
  recommendedCaption: string;
  recommendedCta: string;
  recommendedDurationSeconds: number | null;
  recommendedVisualStyle: string;
  recommendedPostingTime: string;
  rationale: string;
  basedOnRecordCount: number;
  createdBy: string;
}

export async function createKontenAiOptimizationRecommendation(
  supabase: TypedSupabaseClient,
  input: CreateKontenAiOptimizationRecommendationInput,
): Promise<KontenAiOptimizationRecommendationRow> {
  const { data, error } = await supabase
    .from("kontenai_optimization_recommendations")
    .insert({
      recommended_hook: input.recommendedHook,
      recommended_caption: input.recommendedCaption,
      recommended_cta: input.recommendedCta,
      recommended_duration_seconds: input.recommendedDurationSeconds,
      recommended_visual_style: input.recommendedVisualStyle,
      recommended_posting_time: input.recommendedPostingTime,
      rationale: input.rationale,
      based_on_record_count: input.basedOnRecordCount,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiOptimizationRecommendationRow;
}

/** History of every AI Recommendation generation, newest first. */
export async function listKontenAiOptimizationRecommendations(supabase: TypedSupabaseClient, limit = 50): Promise<KontenAiOptimizationRecommendationRow[]> {
  const { data, error } = await supabase
    .from("kontenai_optimization_recommendations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as KontenAiOptimizationRecommendationRow[];
}
