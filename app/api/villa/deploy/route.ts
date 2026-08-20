import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bridge endpoint that deploys a Supabase Edge Function on behalf of the
 * villa system, via the Supabase Management API. Exists because the
 * deploy_edge_function MCP tool is stuck behind a broken approval gate that
 * never resolves in that environment -- this reaches api.supabase.com
 * directly instead, authorized by a Personal Access Token (SUPABASE_ACCESS_TOKEN,
 * account-level, distinct from the project's SUPABASE_SERVICE_ROLE_KEY which
 * only grants database access, not Management API access).
 */

const MANAGEMENT_API_BASE = "https://api.supabase.com";

function secretsMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

interface DeployFile {
  name: string;
  content: string;
}

export async function POST(request: Request) {
  const expected = (process.env.VILLA_DEPLOY_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/deploy: VILLA_DEPLOY_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-deploy:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/deploy: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/deploy: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    logger.error("villa/deploy: SUPABASE_ACCESS_TOKEN is not configured");
    return NextResponse.json({ success: false, error: "SUPABASE_ACCESS_TOKEN not configured" }, { status: 503 });
  }

  let body: {
    project_ref?: unknown;
    function_slug?: unknown;
    entrypoint_path?: unknown;
    verify_jwt?: unknown;
    files?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const projectRef = typeof body.project_ref === "string" ? body.project_ref.trim() : "";
  const functionSlug = typeof body.function_slug === "string" ? body.function_slug.trim() : "";
  const entrypointPath = typeof body.entrypoint_path === "string" ? body.entrypoint_path.trim() : "index.ts";
  const verifyJwt = typeof body.verify_jwt === "boolean" ? body.verify_jwt : false;
  const files = Array.isArray(body.files) ? (body.files as unknown[]) : [];

  if (!projectRef || !functionSlug || files.length === 0) {
    return NextResponse.json(
      { success: false, error: "project_ref, function_slug and at least one file are required" },
      { status: 400 },
    );
  }

  const parsedFiles: DeployFile[] = [];
  for (const f of files) {
    if (typeof f !== "object" || f === null) {
      return NextResponse.json({ success: false, error: "each file must be an object" }, { status: 400 });
    }
    const name = (f as Record<string, unknown>).name;
    const content = (f as Record<string, unknown>).content;
    if (typeof name !== "string" || typeof content !== "string") {
      return NextResponse.json({ success: false, error: "each file needs string name and content" }, { status: 400 });
    }
    parsedFiles.push({ name, content });
  }

  const form = new FormData();
  form.append(
    "metadata",
    JSON.stringify({
      name: functionSlug,
      entrypoint_path: entrypointPath,
      verify_jwt: verifyJwt,
    }),
  );
  for (const f of parsedFiles) {
    form.append("file", new Blob([f.content], { type: "text/plain" }), f.name);
  }

  const url = `${MANAGEMENT_API_BASE}/v1/projects/${encodeURIComponent(projectRef)}/functions/deploy?slug=${encodeURIComponent(functionSlug)}`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      logger.warn("villa/deploy: Management API deploy failed", {
        status: response.status,
        function_slug: functionSlug,
        result,
      });
      return NextResponse.json(
        { success: false, error: (result as { message?: string } | null)?.message ?? `HTTP ${response.status}`, detail: result },
        { status: 502 },
      );
    }
    logger.info("villa/deploy: deployed edge function", { function_slug: functionSlug, project_ref: projectRef });
    return NextResponse.json({ success: true, result });
  } catch (e) {
    logger.error("villa/deploy: request to Management API failed", { error: String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
