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
 * lib/kontenai, lib/supabase/admin.ts, repositories/, types/ -- to a host
 * with Node 22+, then run continuously:
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
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
import { resolveLocalMacAssetPath } from "./local-mac-asset-resolver";
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

    // Production direction from the brief (0184). Before it existed the worker
    // narrated every scene unconditionally and searched Freesound with the
    // brief's big_idea -- i.e. queried an audio library with marketing copy, so
    // most renders got an unrelated music bed or none at all.
    const direction = (storyboard.creativeBrief?.production_direction ?? {}) as {
      music?: { useMusic?: boolean; searchQuery?: string };
      voiceOver?: { useVoiceOver?: boolean };
    };
    const useVoiceOver = direction.voiceOver?.useVoiceOver !== false;

    await updateKontenAiRenderJobProgress(supabase, jobId, {
      progress: 10,
      stage: useVoiceOver ? "Membuat voice over" : "Menyiapkan scene (tanpa voice over)",
    });
    const scenes: RenderScene[] = await Promise.all(
      storyboard.scenes.map(async (scene) => {
        const asset = assetById.get(scene.selectedAssetId!);
        if (!asset) throw new Error(`Aset untuk scene "${scene.sceneTitle}" tidak ditemukan`);

        // local_mac assets: try a direct disk read first (this worker running
        // on the same Mac Mini as the Filemanager agent) before falling back
        // to the network delivery-link path resolveAssetDownloadSource uses
        // -- see local-mac-asset-resolver.ts's module comment for why this
        // stays out of the shared lib/ code path.
        const localPath = asset.storageProvider === "local_mac" ? resolveLocalMacAssetPath(asset.storagePath) : null;

        const [source, voiceOverPcm] = await Promise.all([
          localPath ? Promise.resolve(null) : resolveAssetDownloadSource({ storage_provider: asset.storageProvider, storage_path: asset.storagePath, public_url: asset.publicUrl }),
          // A brief that decided this piece works better silent gets silence:
          // narrating an aesthetic villa tour over music is exactly the kind of
          // generic output the audit marks down.
          useVoiceOver ? synthesizeVoiceOver(scene.voiceOver) : Promise.resolve(null),
        ]);
        return {
          assetUrl: source?.url ?? "",
          assetHeaders: source?.headers,
          assetLocalPath: localPath,
          assetType: asset.assetType === "video" ? "video" : "image",
          durationSeconds: scene.durationSeconds,
          voiceOverPcm,
        };
      }),
    );

    // music.searchQuery is English audio vocabulary the Director wrote for
    // exactly this lookup; big_idea is only a last-resort fallback for briefs
    // created before 0184.
    const wantsMusic = direction.music?.useMusic !== false;
    const musicQuery =
      direction.music?.searchQuery?.trim() ||
      storyboard.creativeBrief?.big_idea ||
      storyboard.creativeBrief?.product_project ||
      "cinematic background music";

    await updateKontenAiRenderJobProgress(supabase, jobId, {
      progress: 18,
      stage: wantsMusic ? "Mencari background music" : "Render tanpa background music",
    });
    const music = wantsMusic ? await fetchBackgroundMusic(musicQuery) : null;
    if (music) console.log(`[render-worker] job ${jobId} background music: "${music.name}" (${music.license}) via query "${musicQuery}"`);

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
