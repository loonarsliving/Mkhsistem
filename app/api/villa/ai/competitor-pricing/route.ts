import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { researchVillaCompetitorRates } from "@/lib/ai/domains/villa-competitor-pricing";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bridge endpoint for villa's Revenue Engine high-season market research
 * (see lib/ai/domains/villa-competitor-pricing.ts for the full
 * rationale/guardrails). Same shared-secret pattern as the existing
 * app/api/villa/ai/pricing-insight and cctv-vision bridges -- one caller
 * (villa's server-side code), one credential (VILLA_BRIDGE_SECRET).
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

interface Body {
  location_label?: unknown;
  room_type_name?: unknown;
  room_type_description?: unknown;
}

export async function POST(request: Request) {
  const expected = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/ai/competitor-pricing: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-competitor-pricing:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/competitor-pricing: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/competitor-pricing: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.location_label !== "string" || typeof body.room_type_name !== "string") {
    return NextResponse.json({ success: false, error: "missing or invalid required fields" }, { status: 400 });
  }

  try {
    const results = await researchVillaCompetitorRates({
      location_label: body.location_label.slice(0, 200),
      room_type_name: body.room_type_name.slice(0, 200),
      room_type_description: typeof body.room_type_description === "string" ? body.room_type_description.slice(0, 500) : "",
    });
    return NextResponse.json({ success: true, results });
  } catch (e) {
    logger.error("villa/ai/competitor-pricing: research failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
