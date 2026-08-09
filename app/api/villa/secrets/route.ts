import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sets Supabase Edge Function secrets (project-level env vars) via the
 * Management API, for the same reason app/api/villa/deploy exists: no
 * direct MCP tool for this, and the deploy_edge_function-family tools are
 * stuck behind a broken approval gate. Separate route from villa/deploy
 * (and its own secret) since setting secrets is a distinct, more sensitive
 * operation than shipping function code.
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

export async function POST(request: Request) {
  const expected = (process.env.VILLA_DEPLOY_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/secrets: VILLA_DEPLOY_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    logger.warn("villa/secrets: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    logger.error("villa/secrets: SUPABASE_ACCESS_TOKEN is not configured");
    return NextResponse.json({ success: false, error: "SUPABASE_ACCESS_TOKEN not configured" }, { status: 503 });
  }

  let body: { project_ref?: unknown; secrets?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const projectRef = typeof body.project_ref === "string" ? body.project_ref.trim() : "";
  const secretsInput = body.secrets;
  if (!projectRef || typeof secretsInput !== "object" || secretsInput === null || Array.isArray(secretsInput)) {
    return NextResponse.json(
      { success: false, error: "project_ref and secrets (object of name -> value) are required" },
      { status: 400 },
    );
  }

  const entries = Object.entries(secretsInput as Record<string, unknown>);
  for (const [name, value] of entries) {
    if (typeof value !== "string" || value.length === 0) {
      return NextResponse.json({ success: false, error: `secret "${name}" must be a non-empty string` }, { status: 400 });
    }
  }
  if (entries.length === 0) {
    return NextResponse.json({ success: false, error: "at least one secret is required" }, { status: 400 });
  }

  const payload = entries.map(([name, value]) => ({ name, value: value as string }));
  const url = `${MANAGEMENT_API_BASE}/v1/projects/${encodeURIComponent(projectRef)}/secrets`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      logger.warn("villa/secrets: Management API set-secrets failed", { status: response.status, result });
      return NextResponse.json(
        { success: false, error: (result as { message?: string } | null)?.message ?? `HTTP ${response.status}`, detail: result },
        { status: 502 },
      );
    }
    logger.info("villa/secrets: set secrets", { project_ref: projectRef, names: entries.map(([n]) => n) });
    return NextResponse.json({ success: true, result });
  } catch (e) {
    logger.error("villa/secrets: request to Management API failed", { error: String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
