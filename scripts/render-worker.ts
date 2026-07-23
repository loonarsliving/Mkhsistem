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
 *
 * For a bill-per-render deploy instead of a 24/7 process (e.g. Cloudflare
 * Containers), use scripts/render-worker-server.ts -- it processes exactly
 * one job per HTTP request and shares the same render pipeline via
 * lib/kontenai/render-job-processor.ts.
 */
import { createAdminClient } from "../lib/supabase/admin";
import { processKontenAiRenderJob } from "../lib/kontenai/render-job-processor";
import { claimKontenAiRenderJob, listQueuedKontenAiRenderJobIds } from "../repositories/kontenai-render-jobs.repository";

const POLL_INTERVAL_MS = Number(process.env.RENDER_WORKER_POLL_INTERVAL_MS ?? 5000);

async function tick(): Promise<void> {
  const supabase = createAdminClient();
  const queuedIds = await listQueuedKontenAiRenderJobIds(supabase);

  for (const jobId of queuedIds) {
    const claimed = await claimKontenAiRenderJob(supabase, jobId);
    if (!claimed) continue;
    await processKontenAiRenderJob(supabase, jobId);
  }
}

async function main(): Promise<void> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the render worker.");
    process.exit(1);
  }

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

void main();
