import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { draftChatReply, MAX_PENGETAHUAN_CHARS, MAX_RIWAYAT, type ChatReplyInput, type PesanRiwayat } from "@/lib/ai/domains/villa-chat-reply";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Bridge endpoint for villa's receptionist chat AI drafts (see
 * lib/ai/domains/villa-chat-reply.ts). Same shared-secret pattern as the
 * other app/api/villa/ai/* bridges -- one caller (villa's server-side code),
 * one credential (VILLA_BRIDGE_SECRET).
 *
 * POST ChatReplyInput -> { success, kategori, draf, cek_tanggal, alasan }
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
    logger.error("villa/ai/chat-reply: VILLA_BRIDGE_SECRET is not configured");
    return NextResponse.json({ success: false, error: "bridge not configured" }, { status: 503 });
  }

  const provided = (request.headers.get("x-internal-secret") ?? "").trim();
  if (!secretsMatch(provided, expected)) {
    const limited = recordAuthFailure(`villa-chat-reply:${getClientIp(request)}`);
    if (limited) {
      logger.warn("villa/ai/chat-reply: rate-limited after repeated invalid x-internal-secret attempts");
      return NextResponse.json({ success: false, error: "too many attempts" }, { status: 429 });
    }
    logger.warn("villa/ai/chat-reply: rejected request with missing or invalid x-internal-secret");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "invalid JSON body" }, { status: 400 });
  }

  const pengetahuan = typeof body.pengetahuan === "string" ? body.pengetahuan.trim() : "";
  const sekarang = typeof body.sekarang === "string" ? body.sekarang.trim() : "";
  const riwayat: PesanRiwayat[] = Array.isArray(body.riwayat)
    ? (body.riwayat as Record<string, unknown>[])
        .filter((m) => (m?.arah === "masuk" || m?.arah === "keluar") && typeof m.isi === "string")
        .slice(-MAX_RIWAYAT)
        .map((m) => ({
          arah: m.arah as PesanRiwayat["arah"],
          isi: String(m.isi).slice(0, 4000),
          waktu: typeof m.waktu === "string" ? m.waktu : undefined,
        }))
    : [];
  if (!pengetahuan || !sekarang || riwayat.length === 0) {
    return NextResponse.json({ success: false, error: "pengetahuan, sekarang and riwayat are required" }, { status: 400 });
  }
  if (pengetahuan.length > MAX_PENGETAHUAN_CHARS) {
    return NextResponse.json({ success: false, error: `pengetahuan exceeds ${MAX_PENGETAHUAN_CHARS} characters` }, { status: 400 });
  }

  const input: ChatReplyInput = {
    pengetahuan,
    sekarang,
    riwayat,
    nama_tamu: typeof body.nama_tamu === "string" ? body.nama_tamu : null,
    konteks_tamu: typeof body.konteks_tamu === "string" ? body.konteks_tamu : null,
    ketersediaan: (body.ketersediaan ?? null) as ChatReplyInput["ketersediaan"],
  };

  try {
    const draft = await draftChatReply(input);
    return NextResponse.json({ success: true, ...draft });
  } catch (e) {
    logger.error("villa/ai/chat-reply: draft failed", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ success: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
