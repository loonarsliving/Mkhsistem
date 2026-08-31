import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { detectPersonInZone } from "@/lib/ai/domains/cctv-vision";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bridge endpoint for villa's AI CCTV checkpoint module
 * (loonarsliving/villa's src/lib/aiBridge.ts) to run Gemini Vision presence
 * detection on a snapshot, without villa needing its own GEMINI_API_KEY.
 * Guarded by the same shared secret as /api/wa/send (VILLA_BRIDGE_SECRET),
 * same reasoning: the caller is a server (villa's cron), not a browser.
 */

/** Constant-time comparison, same approach as lib/security/cron-auth.ts and /api/wa/send. */
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
    logger.error("villa/ai/cctv-vision: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-cctv-vision:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/cctv-vision: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/cctv-vision: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { image?: unknown; mimeType?: unknown; zona?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const zona = typeof body.zona === "string" && body.zona.trim() ? body.zona.trim() : "area";
  if (!image || !mimeType) {
    return NextResponse.json({ success: false, error: "image and mimeType are required" }, { status: 400 });
  }

  try {
    const result = await detectPersonInZone({ imageBase64: image, mimeType, zona });
    return NextResponse.json({ success: true, person_present: result.person_present, description: result.description });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    logger.warn("villa/ai/cctv-vision: detectPersonInZone failed", { error });
    return NextResponse.json({ success: false, error }, { status: 502 });
  }
}
