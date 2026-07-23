"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { createClient } from "@/lib/supabase/server";
import { createKontenAiRenderJob, getKontenAiRenderJob, listKontenAiRenderJobs, type KontenAiRenderJobWithStoryboard } from "@/repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "@/repositories/kontenai-storyboards.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiRenderJobRow } from "@/types/domain";

const RENDER_ENGINE_PATH = "/kontenai/render-engine";

/**
 * Queues a render job -- validates the storyboard is render-ready (every
 * scene has a selected asset) and inserts a 'queued' row. The actual ffmpeg
 * render never runs inside a Vercel function: scripts/render-worker.ts, a
 * standalone process running continuously on its own host, polls
 * kontenai_render_jobs for 'queued' rows, claims one, and does the real
 * encode there -- long/heavy renders would otherwise risk a serverless
 * function's duration/memory limits. This action's only job is to queue;
 * getRenderJobAction (polled by the UI) is how progress is observed.
 */
export async function createRenderJobAction(storyboardId: string): Promise<ActionResult<KontenAiRenderJobRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const storyboard = await getKontenAiStoryboard(supabase, storyboardId);
    if (storyboard.scenes.length === 0) return actionError("Storyboard belum memiliki scene");
    if (!storyboard.scenes.every((scene) => scene.selectedAssetId)) {
      return actionError("Semua scene harus memiliki aset terpilih -- lengkapi di Asset Selector terlebih dahulu");
    }

    const job = await createKontenAiRenderJob(supabase, { storyboardId, createdBy: session.userId });
    revalidatePath(RENDER_ENGINE_PATH);
    return actionSuccess(job);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal membuat render job");
  }
}

export async function getRenderJobAction(jobId: string): Promise<KontenAiRenderJobRow> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return getKontenAiRenderJob(supabase, jobId);
}

/** "Simpan riwayat render ke database" + the history list shown on the page. */
export async function listRenderJobHistoryAction(): Promise<KontenAiRenderJobWithStoryboard[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiRenderJobs(supabase);
}
