import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { bacaMutasiBank } from "@/lib/ai/domains/villa-bank-statement";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bridge endpoint for the villa system's Checklist Dana Masuk (owner
 * 2026-10-29: finance sends a bank-statement photo/PDF and the system
 * matches OTA payouts). villa has no Gemini key of its own, so it reaches
 * this app's AI Service here -- same shared secret and pattern as
 * app/api/villa/ai/cctv-vision. Transcription only; see
 * lib/ai/domains/villa-bank-statement.ts.
 */

const MAX_FILE_BASE64_LENGTH = 14_000_000; // ~10MB decoded
const MIME_DIIZINKAN = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

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
    logger.error("villa/ai/bank-statement: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-bank-statement:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/bank-statement: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/bank-statement: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { data?: unknown; mimeType?: unknown; hariIni?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const data = typeof body.data === "string" ? body.data : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";
  const hariIni = typeof body.hariIni === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.hariIni) ? body.hariIni : new Date().toISOString().slice(0, 10);

  if (!data || !mimeType) {
    return NextResponse.json({ success: false, error: "data and mimeType are required" }, { status: 400 });
  }
  if (!MIME_DIIZINKAN.has(mimeType)) {
    return NextResponse.json({ success: false, error: "file harus JPG, PNG, WebP, atau PDF" }, { status: 400 });
  }
  if (data.length > MAX_FILE_BASE64_LENGTH) {
    return NextResponse.json({ success: false, error: "file exceeds maximum allowed size" }, { status: 400 });
  }

  try {
    const hasil = await bacaMutasiBank({ data, mimeType, hariIni });
    return NextResponse.json({ success: true, ...hasil });
  } catch (e) {
    logger.error("villa/ai/bank-statement: reading failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
