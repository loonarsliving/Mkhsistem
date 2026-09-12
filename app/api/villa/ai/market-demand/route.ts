import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { researchVillaMarketDemand } from "@/lib/ai/domains/villa-market-demand";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bridge endpoint for villa's Revenue Engine market-demand research (see
 * lib/ai/domains/villa-market-demand.ts for the full rationale). Same
 * shared-secret pattern as the existing app/api/villa/ai/* bridges --
 * one caller (villa's server-side code), one credential
 * (VILLA_BRIDGE_SECRET). Must be listed in
 * lib/supabase/middleware.ts's PUBLIC_PATHS, same as its siblings.
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
}

export async function POST(request: Request) {
  const expected = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (expected.length === 0) {
    logger.error("villa/ai/market-demand: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-market-demand:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/market-demand: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/market-demand: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.location_label !== "string" || body.location_label.trim().length === 0) {
    return NextResponse.json({ success: false, error: "missing or invalid location_label" }, { status: 400 });
  }

  try {
    const result = await researchVillaMarketDemand({ location_label: body.location_label.slice(0, 200) });
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    logger.error("villa/ai/market-demand: research failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
