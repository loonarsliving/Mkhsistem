import { NextResponse } from "next/server";

import { createBearerClient, getBearerSession, isSuperAdmin } from "@/lib/supabase/bearer";
import { listToolDefinitions, voiceBridgeTools, type VoiceBridgeToolName } from "@/lib/ai/voice-bridge/tools";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Voice bridge for Ultron (the Filehub voice assistant) to call into MK
 * Connect. Deliberately scoped to Super Admin only — this is a personal
 * voice interface for one operator, not a general integration surface.
 * Auth is a Supabase access token in the Authorization header (Ultron logs
 * the operator in directly against this project's Supabase instance and
 * forwards the resulting token); every tool call still runs through RLS via
 * that token, on top of the Super Admin gate below.
 *
 * Cross-origin by design (Ultron is a separate Vercel deployment), so CORS
 * is scoped to a single configured origin rather than left wide open.
 */
function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  const allowed = process.env.VOICE_BRIDGE_ALLOWED_ORIGIN;
  if (!origin || !allowed) return null;
  return origin === allowed ? origin : null;
}

function corsHeaders(request: Request): HeadersInit {
  const origin = allowedOrigin(request);
  if (!origin) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

type AuthResult =
  | { ok: true; session: Awaited<ReturnType<typeof getBearerSession>> & object; supabase: ReturnType<typeof createBearerClient> }
  | { ok: false; status: number; error: string };

async function requireSuperAdminSession(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return { ok: false, status: 401, error: "Missing bearer token" };

  const session = await getBearerSession(token);
  if (!session) return { ok: false, status: 401, error: "Invalid or expired session" };
  if (!isSuperAdmin(session)) return { ok: false, status: 403, error: "Forbidden" };

  return { ok: true, session, supabase: createBearerClient(token) };
}

/** Lists every callable tool with its description + JSON Schema, for the LLM driving the voice conversation. */
export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const result = await requireSuperAdminSession(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }
  return NextResponse.json({ tools: listToolDefinitions() }, { headers });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const result = await requireSuperAdminSession(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }
  const { session, supabase } = result;

  let payload: { tool?: string; input?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  const toolName = payload.tool as VoiceBridgeToolName | undefined;
  if (!toolName || !(toolName in voiceBridgeTools)) {
    return NextResponse.json({ error: `Unknown tool: ${payload.tool}` }, { status: 400, headers });
  }

  const tool = voiceBridgeTools[toolName];
  const parsed = tool.inputSchema.safeParse(payload.input ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400, headers });
  }

  try {
    const output = await tool.handler(supabase, session, parsed.data as never);
    return NextResponse.json({ output }, { headers });
  } catch (err) {
    logger.error("Voice bridge tool call failed", { tool: toolName, error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Tool call failed" }, { status: 500, headers });
  }
}
