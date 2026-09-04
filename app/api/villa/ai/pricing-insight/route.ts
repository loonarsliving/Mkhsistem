import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { explainPricingRecommendation } from "@/lib/ai/domains/villa-pricing-insight";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Bridge endpoint for villa's Revenue Engine "AI Insight" (Phase 8, see
 * lib/ai/domains/villa-pricing-insight.ts for the full guardrail
 * rationale). Same shared-secret pattern as the existing
 * app/api/villa/ai/cctv-vision bridge -- one caller (villa's
 * server-side code), one credential (VILLA_BRIDGE_SECRET).
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
  room_type_name?: unknown;
  target_date?: unknown;
  current_rate?: unknown;
  recommended_rate?: unknown;
  delta_pct?: unknown;
  reason_codes?: unknown;
  guardrail_status?: unknown;
  occupancy_pct?: unknown;
  pickup_bookings_3d?: unknown;
  confidence?: unknown;
}

export async function POST(request: Request) {
  const expected = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/ai/pricing-insight: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-pricing-insight:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/pricing-insight: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/pricing-insight: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const confidence = body.confidence === "low" || body.confidence === "medium" || body.confidence === "high" ? body.confidence : null;
  if (
    typeof body.room_type_name !== "string" ||
    typeof body.target_date !== "string" ||
    typeof body.current_rate !== "number" ||
    typeof body.recommended_rate !== "number" ||
    typeof body.delta_pct !== "number" ||
    typeof body.guardrail_status !== "string" ||
    !confidence
  ) {
    return NextResponse.json({ success: false, error: "missing or invalid required fields" }, { status: 400 });
  }

  try {
    const text = await explainPricingRecommendation({
      room_type_name: body.room_type_name.slice(0, 200),
      target_date: body.target_date.slice(0, 20),
      current_rate: body.current_rate,
      recommended_rate: body.recommended_rate,
      delta_pct: body.delta_pct,
      reason_codes: Array.isArray(body.reason_codes) ? body.reason_codes.filter((r): r is string => typeof r === "string").slice(0, 10) : [],
      guardrail_status: body.guardrail_status.slice(0, 50),
      occupancy_pct: typeof body.occupancy_pct === "number" ? body.occupancy_pct : null,
      pickup_bookings_3d: typeof body.pickup_bookings_3d === "number" ? body.pickup_bookings_3d : null,
      confidence,
    });
    return NextResponse.json({ success: true, insight: text });
  } catch (e) {
    logger.error("villa/ai/pricing-insight: generation failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
