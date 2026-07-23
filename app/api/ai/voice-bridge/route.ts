import { NextResponse } from "next/server";

import { requireSuperAdminBearer } from "@/lib/supabase/bearer";
import { corsHeaders } from "@/lib/ai/voice-bridge/cors";
import { listToolDefinitions, voiceBridgeTools, type VoiceBridgeToolName } from "@/lib/ai/voice-bridge/tools";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Raw tool dispatch for the voice bridge — GET lists every callable tool
 * (name, description, JSON Schema), POST invokes one. Scoped to Super Admin
 * only (see requireSuperAdminBearer). This is the low-level surface used
 * for introspection/testing; the conversational assistant Ultron actually
 * talks to (app/api/ai/voice-assistant) calls these same tool handlers
 * in-process rather than round-tripping through HTTP to itself.
 */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  const result = await requireSuperAdminBearer(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }
  return NextResponse.json({ tools: listToolDefinitions() }, { headers });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const result = await requireSuperAdminBearer(request);
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
