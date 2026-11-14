import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ringkasanHarga } from "@/lib/advisor/revenue-summary";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read-only revenue & pricing summary of the villa (Private Living &
 * Excellent Living) for the Loonars AI Advisor — owner 2026-11-14: the advisor
 * is the brain of MKH Property and helps the villa pricing engine with
 * strategy. Same auth as /api/advisor/hospitality (x-advisor-bridge-secret).
 * Only SELECTs (lib/advisor/revenue-summary.ts); the advisor only RECOMMENDS —
 * nothing here writes rates or touches villa_pricing_recommendations.
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
  const secret = (process.env.ADVISOR_BRIDGE_SECRET ?? "").trim();
  if (secret.length < 32) return NextResponse.json({ error: "advisor bridge not configured" }, { status: 503 });
  const provided = (request.headers.get("x-advisor-bridge-secret") ?? "").trim();
  if (!secretsMatch(provided, secret)) {
    if (recordAuthFailure(`advisor-harga:${getClientIp(request)}`)) return NextResponse.json({ error: "too many attempts" }, { status: 429 });
    logger.warn("advisor/harga: rejected request with invalid secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const hariIni = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
    return NextResponse.json(await ringkasanHarga(createAdminClient(), hariIni));
  } catch (e) {
    logger.error("advisor/harga failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "gagal menyusun ringkasan harga" }, { status: 500 });
  }
}
