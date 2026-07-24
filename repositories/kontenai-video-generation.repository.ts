import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiVideoGenerationJobRow } from "@/types/domain";

export interface CreateKontenAiVideoGenerationJobInput {
  storyboardId: string;
  sceneId: string;
  prompt: string;
  baseAssetId: string | null;
  createdBy: string;
}

/** Queued by Asset Selector (Sprint 5) whenever a scene's best Asset Library match is too weak to trust -- filled in by scripts/veo-worker.ts. */
export async function createKontenAiVideoGenerationJob(
  supabase: TypedSupabaseClient,
  input: CreateKontenAiVideoGenerationJobInput,
): Promise<KontenAiVideoGenerationJobRow> {
  const { data, error } = await supabase
    .from("kontenai_video_generation_jobs")
    .insert({
      storyboard_id: input.storyboardId,
      scene_id: input.sceneId,
      prompt: input.prompt,
      base_asset_id: input.baseAssetId,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiVideoGenerationJobRow;
}

export async function listQueuedKontenAiVideoGenerationJobIds(supabase: TypedSupabaseClient, limit = 5): Promise<string[]> {
  const { data, error } = await supabase
    .from("kontenai_video_generation_jobs")
    .select("id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => row.id);
}

/** Atomically claims one queued job by flipping it to 'generating' only if it's still 'queued' -- returns false if another worker instance already claimed it. */
export async function claimKontenAiVideoGenerationJob(supabase: TypedSupabaseClient, id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("kontenai_video_generation_jobs")
    .update({ status: "generating", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "queued")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

export async function getKontenAiVideoGenerationJob(supabase: TypedSupabaseClient, id: string): Promise<KontenAiVideoGenerationJobRow> {
  const { data, error } = await supabase.from("kontenai_video_generation_jobs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as KontenAiVideoGenerationJobRow;
}

export async function markKontenAiVideoGenerationJobCompleted(supabase: TypedSupabaseClient, id: string, generatedAssetId: string): Promise<void> {
  const { error } = await supabase
    .from("kontenai_video_generation_jobs")
    .update({ status: "completed", generated_asset_id: generatedAssetId, completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function markKontenAiVideoGenerationJobFailed(supabase: TypedSupabaseClient, id: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("kontenai_video_generation_jobs")
    .update({ status: "failed", error_message: errorMessage.slice(0, 500), completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** How many of a storyboard's video-generation jobs are still queued/generating -- used to decide whether the storyboard is now fully ready to render. */
export async function countPendingKontenAiVideoGenerationJobs(supabase: TypedSupabaseClient, storyboardId: string): Promise<number> {
  const { count, error } = await supabase
    .from("kontenai_video_generation_jobs")
    .select("id", { count: "exact", head: true })
    .eq("storyboard_id", storyboardId)
    .in("status", ["queued", "generating"]);
  if (error) throw error;
  return count ?? 0;
}
