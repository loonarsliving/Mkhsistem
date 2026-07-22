import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiRenderJobRow } from "@/types/domain";

export interface KontenAiRenderJobWithStoryboard extends KontenAiRenderJobRow {
  storyboard: { title: string } | null;
}

const SELECT_COLUMNS =
  "id, storyboard_id, status, progress, stage, output_storage_path, output_public_url, duration_seconds, error_message, created_by, created_at, started_at, completed_at, storyboard:storyboard_id(title)";

export async function createKontenAiRenderJob(
  supabase: TypedSupabaseClient,
  input: { storyboardId: string; createdBy: string },
): Promise<KontenAiRenderJobRow> {
  const { data, error } = await supabase
    .from("kontenai_render_jobs")
    .insert({ storyboard_id: input.storyboardId, created_by: input.createdBy })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiRenderJobRow;
}

export async function getKontenAiRenderJob(supabase: TypedSupabaseClient, id: string): Promise<KontenAiRenderJobRow> {
  const { data, error } = await supabase.from("kontenai_render_jobs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as KontenAiRenderJobRow;
}

/** Newest first -- the "riwayat render" history list. */
export async function listKontenAiRenderJobs(supabase: TypedSupabaseClient, limit = 50): Promise<KontenAiRenderJobWithStoryboard[]> {
  const { data, error } = await supabase.from("kontenai_render_jobs").select(SELECT_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as KontenAiRenderJobWithStoryboard[];
}

/** Marks the job as actively rendering and records a coarse, real progress step -- called at each pipeline stage so polling clients see genuine progress, not a simulated animation. */
export async function updateKontenAiRenderJobProgress(
  supabase: TypedSupabaseClient,
  id: string,
  input: { progress: number; stage: string; markStarted?: boolean },
): Promise<void> {
  const { error } = await supabase
    .from("kontenai_render_jobs")
    .update({
      status: "rendering",
      progress: input.progress,
      stage: input.stage,
      ...(input.markStarted ? { started_at: new Date().toISOString() } : {}),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markKontenAiRenderJobCompleted(
  supabase: TypedSupabaseClient,
  id: string,
  input: { outputStoragePath: string; outputPublicUrl: string; durationSeconds: number },
): Promise<KontenAiRenderJobRow> {
  const { data, error } = await supabase
    .from("kontenai_render_jobs")
    .update({
      status: "completed",
      progress: 100,
      stage: "Selesai",
      output_storage_path: input.outputStoragePath,
      output_public_url: input.outputPublicUrl,
      duration_seconds: input.durationSeconds,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiRenderJobRow;
}

export async function markKontenAiRenderJobFailed(supabase: TypedSupabaseClient, id: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("kontenai_render_jobs")
    .update({ status: "failed", stage: "Gagal", error_message: errorMessage.slice(0, 500), completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
