import { NextResponse } from "next/server";

import { requireSuperAdminBearer } from "@/lib/supabase/bearer";
import { corsHeaders } from "@/lib/ai/voice-bridge/cors";
import { converseWithVoiceAssistant, type VoiceTurn } from "@/lib/ai/voice-bridge/gemini-agent";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Conversational entrypoint for Ultron: takes the operator's spoken text
 * (already transcribed client-side) plus recent turn history, runs it
 * through Gemini with voice-bridge tool access, and returns one final
 * line of text to speak back. Same Super Admin + CORS gate as
 * app/api/ai/voice-bridge — see requireSuperAdminBearer.
 */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const result = await requireSuperAdminBearer(request);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers });
  }
  const { session, supabase } = result;

  let payload: { message?: string; history?: VoiceTurn[] };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers });
  }

  if (!payload.message || typeof payload.message !== "string") {
    return NextResponse.json({ error: "Field 'message' is required" }, { status: 400, headers });
  }

  try {
    const text = await converseWithVoiceAssistant(supabase, session, payload.message, payload.history ?? []);
    return NextResponse.json({ text }, { headers });
  } catch (err) {
    logger.error("Voice assistant call failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Voice assistant failed" }, { status: 500, headers });
  }
}
