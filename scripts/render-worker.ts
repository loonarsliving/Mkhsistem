/* eslint-disable no-console -- long-running CLI worker: stdout progress output is the intended behavior */
/**
 * Render Engine worker (KontenAI Sprint 6) -- polls kontenai_render_jobs for
 * queued jobs and runs the actual ffmpeg render outside Vercel, so a render
 * never has to fit inside a serverless function's duration/memory limits.
 *
 * Vercel's role stays: createRenderJobAction (Next.js) inserts a row with
 * status='queued'; this worker (running continuously on its own host --
 * Fly.io, Railway, a small VPS, anywhere Node + ffmpeg can run) claims it,
 * renders, uploads the result to Supabase Storage, and marks it
 * completed/failed. The Next.js app only ever polls getRenderJobAction --
 * it never runs ffmpeg itself anymore.
 *
 * Deploy: copy this repo (or just enough of it -- scripts/, lib/video,
 * lib/kontenai, lib/google-drive, lib/supabase/admin.ts, repositories/,
 * types/ -- to a host with Node 20+, then run continuously:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   GOOGLE_SERVICE_ACCOUNT_JSON=... GOOGLE_DRIVE_ROOT_FOLDER_ID=... \
 *   npx tsx scripts/render-worker.ts
 *
 * (or `npm run render-worker` if the host has this whole repo). Restart-on-
 * crash via the host's process supervisor (systemd, Fly.io's default
 * restart policy, Railway's, pm2, etc) -- this script itself just loops
 * forever with a poll interval, no supervisor logic of its own.
 */
import { createAdminClient } from "../lib/supabase/admin";
import { fetchBackgroundMusic } from "../lib/ai/music";
import { synthesizeVoiceOver } from "../lib/ai/tts";
import { resolveAssetDownloadSource } from "../lib/kontenai/asset-source";
import { cleanupRenderWorkDir, readRenderedFile, renderStoryboardDraft, type RenderScene } from "../lib/video/render-storyboard";
import { listKontenAiAssetsByIds } from "../repositories/kontenai-assets.repository";
import {
  claimKontenAiRenderJob,
  listQueuedKontenAiRenderJobIds,
  markKontenAiRenderJobCompleted,
  markKontenAiRenderJobFailed,
  updateKontenAiRenderJobProgress,
} from "../repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "../repositories/kontenai-storyboards.repository";

const POLL_INTERVAL_MS = Number(process.env.RENDER_WORKER_POLL_INTERVAL_MS ?? 5000);

/**
 * Google Drive was tried for render output (to keep it out of Supabase
 * Storage's shared quota) but a service account has zero storage quota of
 * its own -- uploading a NEW file into a folder it only has Editor access to
 * fails with HTTP 403 unless the folder lives inside a real Shared Drive,
 * which isn't available on this Google account. Back to Supabase Storage.
 */
const RENDER_BUCKET = "kontenai-renders";

async function processJob(jobId: string): Promise<void> {
  const supabase = createAdminClient();
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

async function tick(): Promise<void> {
  const supabase = createAdminClient();
  const queuedIds = await listQueuedKontenAiRenderJobIds(supabase);

  for (const jobId of queuedIds) {
    const claimed = await claimKontenAiRenderJob(supabase, jobId);
    if (!claimed) continue;
    await processJob(jobId);
  }
}

export async function runRenderWorker(): Promise<void> {
  console.log(`[render-worker] polling every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    try {
      await tick();
    } catch (error) {
      console.error("[render-worker] tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (require.main === module) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the render worker.");
    process.exit(1);
  }
  void runRenderWorker();
}
