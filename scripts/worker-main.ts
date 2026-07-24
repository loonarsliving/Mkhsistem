/**
 * Combined entry point for the two standalone KontenAI workers -- the
 * ffmpeg Render Engine worker (scripts/render-worker.ts) and the Veo
 * image-to-video worker (scripts/veo-worker.ts) -- run concurrently in one
 * process on one always-on host (see Dockerfile.render-worker). Both are
 * infinite polling loops, so this never resolves; the host's process
 * supervisor (Railway, systemd, pm2, ...) handles restart-on-crash.
 */
import { runRenderWorker } from "./render-worker";
import { runVeoWorker } from "./veo-worker";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running the workers.");
  process.exit(1);
}

void Promise.all([runRenderWorker(), runVeoWorker()]);
