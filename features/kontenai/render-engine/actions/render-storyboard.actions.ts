"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { cleanupRenderWorkDir, readRenderedFile, renderStoryboardDraft, type RenderScene } from "@/lib/video/render-storyboard";
import { createClient } from "@/lib/supabase/server";
import { listKontenAiAssetsByIds } from "@/repositories/kontenai-assets.repository";
import {
  createKontenAiRenderJob,
  getKontenAiRenderJob,
  listKontenAiRenderJobs,
  markKontenAiRenderJobCompleted,
  markKontenAiRenderJobFailed,
  updateKontenAiRenderJobProgress,
  type KontenAiRenderJobWithStoryboard,
} from "@/repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "@/repositories/kontenai-storyboards.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiRenderJobRow } from "@/types/domain";

const RENDER_ENGINE_PATH = "/kontenai/render-engine";
const RENDER_BUCKET = "kontenai-renders";

/** Step 1: validates the storyboard is render-ready (every scene has a selected asset) and queues a job -- fast, no ffmpeg work here yet. */
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

/**
 * Step 2: the actual render -- downloads every scene's selected asset,
 * builds one fixed-size segment per scene (looped/trimmed to its duration,
 * fade in/out), concatenates them in storyboard order, muxes in a silent
 * placeholder audio track, uploads the draft mp4 to Supabase Storage, and
 * marks the job completed. Progress/stage are persisted at each real step
 * (never simulated) so a concurrent poll of getRenderJobAction sees genuine
 * status. Never throws to the caller -- always leaves the job in a clear
 * terminal state ('completed' or 'failed').
 */
export async function processRenderJobAction(jobId: string): Promise<ActionResult<KontenAiRenderJobRow>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  const job = await getKontenAiRenderJob(supabase, jobId);
  if (job.status !== "queued") {
    return actionError(`Render job ini sudah berstatus "${job.status}", tidak bisa diproses ulang`);
  }

  let workDir: string | null = null;
  try {
    await updateKontenAiRenderJobProgress(supabase, jobId, { progress: 2, stage: "Mengambil storyboard", markStarted: true });
    const storyboard = await getKontenAiStoryboard(supabase, job.storyboard_id);

    const assetIds = storyboard.scenes.map((scene) => scene.selectedAssetId!).filter(Boolean);
    const assets = await listKontenAiAssetsByIds(supabase, [...new Set(assetIds)]);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));

    const scenes: RenderScene[] = storyboard.scenes.map((scene) => {
      const asset = assetById.get(scene.selectedAssetId!);
      if (!asset) throw new Error(`Aset untuk scene "${scene.sceneTitle}" tidak ditemukan`);
      return { assetUrl: asset.publicUrl, assetType: asset.assetType === "video" ? "video" : "image", durationSeconds: scene.durationSeconds };
    });

    const result = await renderStoryboardDraft(scenes, async (progress, stage) => {
      await updateKontenAiRenderJobProgress(supabase, jobId, { progress, stage });
    });
    workDir = result.workDir;

    await updateKontenAiRenderJobProgress(supabase, jobId, { progress: 95, stage: "Mengunggah hasil render" });
    const buffer = await readRenderedFile(result.outputPath);
    const storagePath = `${storyboard.id}/${jobId}.mp4`;

    const { error: uploadError } = await supabase.storage.from(RENDER_BUCKET).upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(RENDER_BUCKET).getPublicUrl(storagePath);

    const completed = await markKontenAiRenderJobCompleted(supabase, jobId, {
      outputStoragePath: storagePath,
      outputPublicUrl: publicUrlData.publicUrl,
      durationSeconds: storyboard.total_duration_seconds,
    });

    revalidatePath(RENDER_ENGINE_PATH);
    return actionSuccess(completed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal merender storyboard";
    await markKontenAiRenderJobFailed(supabase, jobId, message);
    revalidatePath(RENDER_ENGINE_PATH);
    return actionError(message);
  } finally {
    if (workDir) await cleanupRenderWorkDir(workDir);
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
