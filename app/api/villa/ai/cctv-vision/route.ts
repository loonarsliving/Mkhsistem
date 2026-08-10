import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { generateAIText } from "@/lib/ai/service";
import { isGeminiConfigured } from "@/lib/ai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * AI bridge for villa's AI CCTV module (src/lib/aiBridge.ts,
 * src/lib/cctvCheckpoint.ts in loonarsliving/villa). Villa has no Gemini
 * integration or GEMINI_API_KEY of its own -- every checkpoint snapshot is
 * sent here instead, so the module rides Mkhsistem's existing AI Service
 * (lib/ai/service.ts: shared retry/backoff, circuit breaker, and telemetry)
 * rather than villa needing a second, unmonitored Gemini credential.
 *
 * Guarded by the same shared secret as app/api/wa/send (VILLA_BRIDGE_SECRET)
 * since both are routine, frequent, server-to-server calls from villa --
 * distinct from VILLA_DEPLOY_SECRET, which app/api/villa/deploy and
 * app/api/villa/secrets use for rarer, higher-privilege operations.
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

const ZONA_CONTEXT: Record<string, string> = {
  security: "Ini adalah snapshot dari kamera keamanan pada sebuah titik patroli villa.",
  front_desk: "Ini adalah snapshot dari kamera yang mengawasi meja resepsionis/front desk villa.",
  housekeeping: "Ini adalah snapshot dari kamera di dalam atau di depan pintu kamar villa, untuk mencatat kunjungan cleaning service.",
};

const SYSTEM_PROMPT =
  "Kamu adalah sistem pencatat checkpoint CCTV untuk villa. Tugasmu murni faktual: apakah ada orang yang terlihat di frame. " +
  "Jangan menilai kualitas kerja, profesionalisme, atau kebersihan -- itu bukan sesuatu yang bisa dinilai dari satu foto. " +
  'Balas HANYA dengan JSON valid berbentuk {"person_present": boolean, "description": string}. ' +
  "description singkat (maks 25 kata), bahasa Indonesia, jelaskan apa yang terlihat di frame secara netral.";

export async function POST(request: Request) {
  const expected = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/ai/cctv-vision: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    logger.warn("villa/ai/cctv-vision: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json({ success: false, error: "GEMINI_API_KEY is not configured" }, { status: 503 });
  }

  let body: { image?: unknown; mimeType?: unknown; zona?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const image = typeof body.image === "string" ? body.image : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
  const zona = typeof body.zona === "string" ? body.zona : "";
  if (!image) {
    return NextResponse.json({ success: false, error: "image (base64) is required" }, { status: 400 });
  }

  try {
    const response = await generateAIText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: ZONA_CONTEXT[zona] || "Ini adalah snapshot dari kamera CCTV villa.",
      image: { data: image, mimeType },
      responseFormat: "json",
      temperature: 0.2,
      maxOutputTokens: 256,
    });

    let parsed: { person_present?: unknown; description?: unknown };
    try {
      parsed = JSON.parse(response.text);
    } catch {
      logger.warn("villa/ai/cctv-vision: model returned non-JSON text", { text: response.text.slice(0, 200) });
      return NextResponse.json({ success: false, error: "model returned non-JSON response" }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      person_present: !!parsed.person_present,
      description: typeof parsed.description === "string" ? parsed.description : "",
    });
  } catch (e) {
    logger.error("villa/ai/cctv-vision: generateAIText failed", { error: String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
