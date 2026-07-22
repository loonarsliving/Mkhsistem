import { RenderContainer } from "./render-container";

export { RenderContainer };

export interface Env {
  RENDER_CONTAINER: DurableObjectNamespace<RenderContainer>;
  RENDER_WORKER_SHARED_SECRET: string;
}

/**
 * Public entry point for on-demand rendering. A Supabase Database Webhook on
 * kontenai_render_jobs INSERT (status='queued') calls POST /render here with
 * { jobId }; this Worker starts (or reuses) a Container instance dedicated to
 * that job and forwards the request to it. See scripts/render-worker-server.ts
 * for what actually runs inside the container.
 */
const renderWorker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/render") {
      return new Response("Not found", { status: 404 });
    }

    if (request.headers.get("authorization") !== `Bearer ${env.RENDER_WORKER_SHARED_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    let jobId: string;
    try {
      const body = (await request.json()) as { jobId?: unknown };
      if (typeof body.jobId !== "string" || !body.jobId) throw new Error("Missing jobId");
      jobId = body.jobId;
    } catch (error) {
      return new Response(error instanceof Error ? error.message : "Bad request", { status: 400 });
    }

    const containerId = env.RENDER_CONTAINER.idFromName(jobId);
    const container = env.RENDER_CONTAINER.get(containerId);

    return container.fetch("http://container/render", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RENDER_WORKER_SHARED_SECRET}`,
      },
      body: JSON.stringify({ jobId }),
    });
  },
};

export default renderWorker;
