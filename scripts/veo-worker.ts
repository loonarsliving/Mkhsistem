/* eslint-disable no-console -- long-running CLI worker: stdout progress output is the intended behavior */
/**
 * Veo image-to-video worker (KontenAI Sprint 5 fallback) -- polls
 * kontenai_video_generation_jobs for queued jobs and calls Veo outside
 * Vercel, since a single generation routinely takes several minutes, far
 * past a serverless function's duration budget.
 *
 * Asset Selector (features/kontenai/asset-selector/actions/select-assets.actions.ts)
 * queues a job whenever a scene's best Asset Library match scores too low
 * to trust. This worker: picks the weak match as Veo's starting image,
 * generates a proper clip from the scene's brief, uploads it to Google
 * Drive as a new Asset Library entry, and overwrites that scene's
 * selectedAssetId with the new asset. Once every job for a storyboard is
 * done and every scene has a selectedAssetId, it queues the render job
 * itself -- the pipeline finishes on its own, no manual click needed.
 *
 * Deploy alongside scripts/render-worker.ts (see scripts/worker-main.ts,
 * which runs both loops in one process) on the same always-on host.
 */
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { generateVideoFromImage, isVeoConfigured } from "../lib/ai/veo/client";
import { ensureDriveFolderPath, uploadFileToDrive } from "../lib/google-drive/client";
import { resolveAssetDownloadSource } from "../lib/kontenai/asset-source";
import { createAdminClient } from "../lib/supabase/admin";
import { createKontenAiAsset, getKontenAiAsset } from "../repositories/kontenai-assets.repository";
import { createKontenAiRenderJob } from "../repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard, updateKontenAiStoryboardScenes } from "../repositories/kontenai-storyboards.repository";
import {
  claimKontenAiVideoGenerationJob,
  countPendingKontenAiVideoGenerationJobs,
  getKontenAiVideoGenerationJob,
  listQueuedKontenAiVideoGenerationJobIds,
  markKontenAiVideoGenerationJobCompleted,
  markKontenAiVideoGenerationJobFailed,
} from "../repositories/kontenai-video-generation.repository";

const POLL_INTERVAL_MS = Number(process.env.VEO_WORKER_POLL_INTERVAL_MS ?? 10000);

async function fetchImageAsBase64(assetId: string): Promise<{ base64: string; mimeType: string }> {
  const supabase = createAdminClient();
  const asset = await getKontenAiAsset(supabase, assetId);
  const source = await resolveAssetDownloadSource(asset);
  const response = await fetch(source.url, { headers: source.headers });
  if (!response.ok) throw new Error(`Gagal mengambil foto dasar (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: buffer.toString("base64"), mimeType: asset.file_type || "image/jpeg" };
}

/** Once a storyboard has zero pending video-generation jobs left, checks whether every scene now has a selectedAssetId and, if so, queues the render job -- closing the loop with no manual step. */
async function maybeAutoQueueRender(storyboardId: string, createdBy: string): Promise<void> {
  const supabase = createAdminClient();
  const pending = await countPendingKontenAiVideoGenerationJobs(supabase, storyboardId);
  if (pending > 0) return;

  const storyboard = await getKontenAiStoryboard(supabase, storyboardId);
  if (!storyboard.scenes.every((scene) => scene.selectedAssetId)) return;

  await createKontenAiRenderJob(supabase, { storyboardId, createdBy });
  console.log(`[veo-worker] storyboard ${storyboardId} fully resolved -- render job queued`);
}

async function processJob(jobId: string): Promise<void> {
  const supabase = createAdminClient();
  const job = await getKontenAiVideoGenerationJob(supabase, jobId);
  let workDir: string | null = null;

  try {
    if (!job.base_asset_id) throw new Error("Tidak ada foto dasar untuk dijadikan input Veo -- lengkapi Asset Library terlebih dahulu");

    const { base64, mimeType } = await fetchImageAsBase64(job.base_asset_id);

    workDir = await mkdtemp(join(tmpdir(), "veo-"));
    const videoPath = join(workDir, "generated.mp4");

    await generateVideoFromImage({ prompt: job.prompt, imageBase64: base64, imageMimeType: mimeType, downloadPath: videoPath });

    const buffer = await readFile(videoPath);
    const folderId = await ensureDriveFolderPath(["Veo Generated", new Date().toISOString().slice(0, 10)]);
    const { fileId, webViewLink } = await uploadFileToDrive({ folderId, filename: `veo-${jobId}.mp4`, mimeType: "video/mp4", buffer });

    const asset = await createKontenAiAsset(supabase, {
      title: `Veo: ${job.prompt.slice(0, 80)}`,
      description: job.prompt,
      filename: `veo-${jobId}.mp4`,
      asset_type: "video",
      storage_path: fileId,
      public_url: webViewLink,
      storage_provider: "google_drive",
      file_type: "video/mp4",
      file_size_bytes: buffer.byteLength,
      resolution: null,
      duration_seconds: null,
      company: null,
      project: null,
      campaign: null,
      platform: null,
      content_type: "veo_generated",
      location: null,
      tags: ["veo-generated"],
      created_by: job.created_by,
    });

    const storyboard = await getKontenAiStoryboard(supabase, job.storyboard_id);
    const scenes = storyboard.scenes.map((scene) => (scene.id === job.scene_id ? { ...scene, selectedAssetId: asset.id } : scene));
    await updateKontenAiStoryboardScenes(supabase, job.storyboard_id, scenes, job.created_by);

    await markKontenAiVideoGenerationJobCompleted(supabase, jobId, asset.id);
    console.log(`[veo-worker] job ${jobId} completed -- asset ${asset.id}`);

    await maybeAutoQueueRender(job.storyboard_id, job.created_by);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal generate video Veo";
    console.error(`[veo-worker] job ${jobId} failed: ${message}`);
    await markKontenAiVideoGenerationJobFailed(supabase, jobId, message);
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}

async function tick(): Promise<void> {
  const supabase = createAdminClient();
  const queuedIds = await listQueuedKontenAiVideoGenerationJobIds(supabase);

  for (const jobId of queuedIds) {
    const claimed = await claimKontenAiVideoGenerationJob(supabase, jobId);
    if (!claimed) continue;
    await processJob(jobId);
  }
}

export async function runVeoWorker(): Promise<void> {
  if (!isVeoConfigured()) {
    console.log("[veo-worker] VEO_API_KEY not set -- worker idle (jobs will stay queued until it's configured)");
  }

  console.log(`[veo-worker] polling every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    try {
      if (isVeoConfigured()) await tick();
    } catch (error) {
      console.error("[veo-worker] tick failed", error);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

if (require.main === module) {
  void runVeoWorker();
}
