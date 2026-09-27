import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { MAX_TRANSLATE_CHARS, normalizeLanguageCode, translateChatMessage } from "@/lib/ai/domains/villa-chat-translate";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Bridge endpoint for villa's receptionist chat translation (see
 * lib/ai/domains/villa-chat-translate.ts). Same shared-secret pattern as the
 * other app/api/villa/ai/* bridges -- one caller (villa's server-side code),
 * one credential (VILLA_BRIDGE_SECRET).
 *
 * POST { text, target } -> { success, detected_language, translation }
 */

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
  const expected = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/ai/translate: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-translate:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/translate: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/translate: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { text?: unknown; target?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const target = normalizeLanguageCode(body.target);
  if (!text || !target) {
    return NextResponse.json({ success: false, error: "text and a valid target language are required" }, { status: 400 });
  }
  if (text.length > MAX_TRANSLATE_CHARS) {
    return NextResponse.json({ success: false, error: `text exceeds ${MAX_TRANSLATE_CHARS} characters` }, { status: 400 });
  }

  try {
    const result = await translateChatMessage(text, target);
    return NextResponse.json({ success: true, detected_language: result.detectedLanguage, translation: result.translation });
  } catch (e) {
    logger.error("villa/ai/translate: translation failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
