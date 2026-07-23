/* eslint-disable no-console -- shared render pipeline: progress/completion logging is intended output for both worker deploy modes */
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { fetchBackgroundMusic } from "../ai/music";
import { synthesizeVoiceOver } from "../ai/tts";
import { resolveAssetDownloadSource } from "./asset-source";
import { cleanupRenderWorkDir, readRenderedFile, renderStoryboardDraft, type RenderScene } from "../video/render-storyboard";
import { listKontenAiAssetsByIds } from "../../repositories/kontenai-assets.repository";
import { markKontenAiRenderJobCompleted, markKontenAiRenderJobFailed, updateKontenAiRenderJobProgress } from "../../repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "../../repositories/kontenai-storyboards.repository";

/**
 * Google Drive was tried for render output (to keep it out of Supabase
 * Storage's shared quota) but a service account has zero storage quota of
 * its own -- uploading a NEW file into a folder it only has Editor access to
 * fails with HTTP 403 unless the folder lives inside a real Shared Drive,
 * which isn't available on this Google account. Back to Supabase Storage;
 * see markom-content-submissions orphan cleanup (app/api/debug/storage-orphan-cleanup)
 * for how quota headroom was recovered instead.
 */
const RENDER_BUCKET = "kontenai-renders";

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
    const storagePath = `${storyboard.id}/${jobId}.mp4`;

    const { error: uploadError } = await supabase.storage.from(RENDER_BUCKET).upload(storagePath, buffer, { contentType: "video/mp4", upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from(RENDER_BUCKET).getPublicUrl(storagePath);

    await markKontenAiRenderJobCompleted(supabase, jobId, {
      outputStoragePath: storagePath,
      outputPublicUrl: publicUrlData.publicUrl,
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
