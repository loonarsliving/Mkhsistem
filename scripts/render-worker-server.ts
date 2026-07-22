/* eslint-disable no-console -- worker process: stdout is the intended log sink */
/**
 * On-demand Render Engine worker (KontenAI) -- an HTTP-triggered variant of
 * scripts/render-worker.ts for hosts that bill per active-second rather than
 * per always-on process (Cloudflare Containers). Instead of polling forever,
 * it starts idle, renders exactly one job per POST /render request, and lets
 * the host (Cloudflare's Container `sleepAfter`) put the instance to sleep
 * once requests stop arriving -- so cost tracks actual render time instead
 * of 24/7 uptime.
 *
 * Trigger this from a Supabase Database Webhook on
 * kontenai_render_jobs INSERT (status='queued'), pointed at the Cloudflare
 * Worker that fronts the Container (see worker/index.ts). The webhook body
 * must include the new row's `id` as `jobId`, and an
 * `Authorization: Bearer <RENDER_WORKER_SHARED_SECRET>` header matching this
 * process's env var -- this endpoint is reachable only through that Worker,
 * but the shared secret keeps it from executing on any stray/malformed request.
 */
import { createServer, type IncomingMessage } from "node:http";
import { createAdminClient } from "../lib/supabase/worker-admin";
import { processKontenAiRenderJob } from "../lib/kontenai/render-job-processor";
import { claimKontenAiRenderJob } from "../repositories/kontenai-render-jobs.repository";

const PORT = Number(process.env.PORT ?? 8080);
const SHARED_SECRET = process.env.RENDER_WORKER_SHARED_SECRET;

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200).end("ok");
    return;
  }

  if (req.method !== "POST" || req.url !== "/render") {
    res.writeHead(404).end("Not found");
    return;
  }

  if (SHARED_SECRET && req.headers.authorization !== `Bearer ${SHARED_SECRET}`) {
    res.writeHead(401).end("Unauthorized");
    return;
  }

  let jobId: string;
  try {
    const body = await readJsonBody(req);
    if (typeof body.jobId !== "string" || !body.jobId) throw new Error("Missing jobId");
    jobId = body.jobId;
  } catch (error) {
    res.writeHead(400).end(error instanceof Error ? error.message : "Bad request");
    return;
  }

  const supabase = createAdminClient();
  const claimed = await claimKontenAiRenderJob(supabase, jobId);
  if (!claimed) {
    res.writeHead(409).end("Job already claimed or not queued");
    return;
  }

  try {
    await processKontenAiRenderJob(supabase, jobId);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jobId, status: "done" }));
  } catch (error) {
    console.error(`[render-worker-server] job ${jobId} threw unexpectedly`, error);
    res.writeHead(500).end("Render failed");
  }
});

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before starting the render worker server.");
  process.exit(1);
}

server.listen(PORT, () => {
  console.log(`[render-worker-server] listening on :${PORT}`);
});
