/* eslint-disable no-console -- shared render pipeline: progress/completion logging is intended output for both worker deploy modes */
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { fetchBackgroundMusic } from "../ai/music";
import { synthesizeVoiceOver } from "../ai/tts";
import { resolveAssetDownloadSource } from "./asset-source";
import { uploadFileToDrive } from "../google-drive/client";
import { cleanupRenderWorkDir, readRenderedFile, renderStoryboardDraft, type RenderScene } from "../video/render-storyboard";
import { listKontenAiAssetsByIds } from "../../repositories/kontenai-assets.repository";
import { markKontenAiRenderJobCompleted, markKontenAiRenderJobFailed, updateKontenAiRenderJobProgress } from "../../repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "../../repositories/kontenai-storyboards.repository";

/**
 * Drive folder finished renders are uploaded to, before a human moves them
 * into Content Studio for publishing -- keeps output out of Supabase
 * Storage, which is shared with several other features and was already
 * ~950MB into its 1GB free-plan quota after a single test render.
 */
function requireRenderOutputFolderId(): string {
  const id = process.env.GOOGLE_DRIVE_RENDER_OUTPUT_FOLDER_ID;
  if (!id) throw new Error("Set env var GOOGLE_DRIVE_RENDER_OUTPUT_FOLDER_ID (folder Drive tempat menyimpan hasil render).");
  return id;
}

/**
 * Renders one already-claimed job end to end and records the outcome --
 * shared by both the continuous-polling worker (scripts/render-worker.ts)
 * and the on-demand HTTP worker (scripts/render-worker-server.ts) so the
 * two deploy models never drift from each other.
 */
export async function processKontenAiRenderJob(supabase: TypedSupabaseClient, jobId: string): Promise<void> {
  let workDir: string | null = null;

  try {
    await updateKontenAiRenderJobProgress(supabase, jobId, { progress: 2, stage: "Mengambil storyboard" });

    const { data: jobRow, error: jobError } = await supabase.from("kontenai_render_jobs").select("storyboard_id").eq("id", jobId).single();
    if (jobError) throw jobError;

    const storyboard = await getKontenAiStoryboard(supabase, jobRow.storyboard_id);
    const assetIds = storyboard.scenes.map((scene) => scene.selectedAssetId!).filter(Boolean);
    const assets = await listKontenAiAssetsByIds(supabase, [...new Set(assetIds)]);
    const assetById = new Map(assets.map((asset) => [asset.id, asset]));

    await updateKontenAiRenderJobProgress(supabase, jobId, { progress: 10, stage: "Membuat voice over" });
    const scenes: RenderScene[] = await Promise.all(
      storyboard.scenes.map(async (scene) => {
        const asset = assetById.get(scene.selectedAssetId!);
        if (!asset) throw new Error(`Aset untuk scene "${scene.sceneTitle}" tidak ditemukan`);
        const [source, voiceOverPcm] = await Promise.all([
          resolveAssetDownloadSource({ storage_provider: asset.storageProvider, storage_path: asset.storagePath, public_url: asset.publicUrl }),
          synthesizeVoiceOver(scene.voiceOver),
        ]);
        return {
          assetUrl: source.url,
          assetHeaders: source.headers,
          assetType: asset.assetType === "video" ? "video" : "image",
          durationSeconds: scene.durationSeconds,
          voiceOverPcm,
        };
      }),
    );

    await updateKontenAiRenderJobProgress(supabase, jobId, { progress: 18, stage: "Mencari background music" });
    const musicQuery = storyboard.creativeBrief?.big_idea || storyboard.creativeBrief?.product_project || "cinematic background music";
    const music = await fetchBackgroundMusic(musicQuery);
    if (music) console.log(`[render-worker] job ${jobId} background music: "${music.name}" (${music.license})`);

    const result = await renderStoryboardDraft(scenes, {
      targetPlatform: storyboard.creativeBrief?.platform,
      musicBuffer: music?.buffer,
      onProgress: async (progress, stage) => {
        await updateKontenAiRenderJobProgress(supabase, jobId, { progress, stage });
      },
    });
    workDir = result.workDir;

    await updateKontenAiRenderJobProgress(supabase, jobId, { progress: 95, stage: "Mengunggah hasil render" });
    const buffer = await readRenderedFile(result.outputPath);
    const filename = `${storyboard.id}-${jobId}.mp4`;

    const { fileId, webViewLink } = await uploadFileToDrive({
      folderId: requireRenderOutputFolderId(),
      filename,
      mimeType: "video/mp4",
      buffer,
    });

    await markKontenAiRenderJobCompleted(supabase, jobId, {
      outputStoragePath: fileId,
      outputPublicUrl: webViewLink,
      durationSeconds: storyboard.total_duration_seconds,
    });
    console.log(`[render-worker] job ${jobId} completed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal merender storyboard";
    console.error(`[render-worker] job ${jobId} failed: ${message}`);
    await markKontenAiRenderJobFailed(supabase, jobId, message);
  } finally {
    if (workDir) await cleanupRenderWorkDir(workDir);
  }
}
