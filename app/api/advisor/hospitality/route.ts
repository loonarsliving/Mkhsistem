import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { ringkasanHospitality } from "@/lib/advisor/hospitality-summary";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Read-only monthly hospitality summary for the Loonars AI Advisor's
 * "Manager Hospitality AI" seat (D-2026-009). Server-to-server: the advisor
 * service sends x-advisor-bridge-secret = ADVISOR_BRIDGE_SECRET (the same
 * secret it already uses for /api/wa/send). Only SELECTs; numbers computed in
 * code (lib/advisor/hospitality-summary.ts); staff = first name only, guest
 * chat samples masked. Body: { dari?: "YYYY-MM-DD", sampai?: "YYYY-MM-DD" }
 * (default: last 30 days, max 62 days).
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

const TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function hariJakarta(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" });
}

export async function POST(request: Request) {
  const secret = (process.env.ADVISOR_BRIDGE_SECRET ?? "").trim();
  if (secret.length < 32) return NextResponse.json({ error: "advisor bridge not configured" }, { status: 503 });
  const provided = (request.headers.get("x-advisor-bridge-secret") ?? "").trim();
  if (!secretsMatch(provided, secret)) {
    if (recordAuthFailure(`advisor-hosp:${getClientIp(request)}`)) return NextResponse.json({ error: "too many attempts" }, { status: 429 });
    logger.warn("advisor/hospitality: rejected request with invalid secret");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { dari?: unknown; sampai?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const sekarang = new Date();
  const sampai = typeof body.sampai === "string" && TANGGAL.test(body.sampai) ? body.sampai : hariJakarta(sekarang);
  const dari = typeof body.dari === "string" && TANGGAL.test(body.dari) ? body.dari : hariJakarta(new Date(sekarang.getTime() - 29 * 86400000));
  const rentang = (Date.parse(sampai) - Date.parse(dari)) / 86400000;
  if (!(rentang >= 0 && rentang <= 62)) return NextResponse.json({ error: "rentang tanggal harus 0–62 hari" }, { status: 400 });

  try {
    const ringkasan = await ringkasanHospitality(createAdminClient(), dari, sampai, sekarang);
    return NextResponse.json(ringkasan);
  } catch (e) {
    logger.error("advisor/hospitality failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "gagal menyusun ringkasan" }, { status: 500 });
  }
}
