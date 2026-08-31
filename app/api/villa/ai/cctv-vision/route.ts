import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { detectPersonInZone } from "@/lib/ai/domains/villa-cctv-vision";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bridge endpoint for the villa reservation system's AI CCTV checkpoint
 * module (loonarsliving/villa's src/lib/aiBridge.ts) -- villa has no Gemini
 * integration or GEMINI_API_KEY of its own, so it reaches this app's
 * existing AI Service for a single presence-detection Gemini Vision call.
 * Guarded by the SAME shared secret as the WhatsApp bridge (VILLA_BRIDGE_SECRET,
 * see app/api/wa/send/route.ts), since it's the same caller (villa-api /
 * villa's server-side code) authenticated the same way -- not a second,
 * separately-managed credential.
 */

const MAX_IMAGE_BASE64_LENGTH = 10_000_000; // ~7.3MB decoded, comfortably above a single EZVIZ snapshot

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
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim() : "";
  const zona = typeof body.zona === "string" && body.zona.trim() ? body.zona.trim().slice(0, 100) : "area";

  if (!image || !mimeType) {
    return NextResponse.json({ success: false, error: "image and mimeType are required" }, { status: 400 });
  }
  if (image.length > MAX_IMAGE_BASE64_LENGTH) {
    return NextResponse.json({ success: false, error: "image exceeds maximum allowed size" }, { status: 400 });
  }

  try {
    const detection = await detectPersonInZone({ imageBase64: image, imageMimeType: mimeType, zona });
    return NextResponse.json({ success: true, person_present: detection.person_present, description: detection.description });
  } catch (e) {
    logger.error("villa/ai/cctv-vision: detection failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
