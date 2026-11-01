import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { askAI } from "@/lib/ai/service";
import { tandaAiCfoSah } from "@/lib/security/mkh-property-cfo";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Layanan AI untuk AI CFO MKH Property (mkh-properti src/lib/cfo/server.ts).
 * MKH Property tidak punya kunci/penyedia AI sendiri — narasi jawaban AI CFO
 * memakai penyedia AI MK Connect ini (circuit breaker, telemetri, retry).
 *
 * Autentikasi server-ke-server tanpa rahasia baru dan tanpa rahasia lewat
 * jaringan: database MKH Property (RPC cfo_tanda_ai, migrasi 0057) menandatangani
 *   HMAC-SHA256(rahasia sync, "ai-cfo-narasi|<ts>|<sha256(body)>")
 * dan route ini memverifikasinya dengan rahasia sync yang sama
 * (get_sync_secret; Vault mk_sync_shared_secret ada di kedua database).
 * Tanda tangan berlaku 5 menit dan terikat pada isi body.
 *
 * Body: { sistem: string, pengguna: string }  →  { teks: string }
 * Angka di jawaban divalidasi ulang oleh MKH Property terhadap daftar fakta.
 */
const MAKS_SISTEM = 6_000;
const MAKS_PENGGUNA = 60_000;

export async function POST(request: Request) {
  const body = await request.text();
  const ts = request.headers.get("x-mkh-cfo-ts") ?? "";
  const sig = (request.headers.get("x-mkh-cfo-sig") ?? "").toLowerCase();
  const { data: secret } = await createAdminClient().rpc("get_sync_secret");
  if (!secret || !tandaAiCfoSah(String(secret), ts, sig, body, Math.floor(Date.now() / 1000))) {
    if (recordAuthFailure(`ai-cfo-narasi:${getClientIp(request)}`)) {
      return NextResponse.json({ error: "too many attempts" }, { status: 429 });
    }
    logger.warn("ai-cfo/narasi: tanda tangan tidak sah");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let isi: { sistem?: unknown; pengguna?: unknown };
  try {
    isi = JSON.parse(body) as typeof isi;
  } catch {
    return NextResponse.json({ error: "body harus JSON" }, { status: 400 });
  }
  if (typeof isi.sistem !== "string" || typeof isi.pengguna !== "string" || !isi.sistem || !isi.pengguna) {
    return NextResponse.json({ error: "sistem & pengguna wajib" }, { status: 400 });
  }
  if (isi.sistem.length > MAKS_SISTEM || isi.pengguna.length > MAKS_PENGGUNA) {
    return NextResponse.json({ error: "terlalu panjang" }, { status: 413 });
  }

  try {
    const teks = await askAI(isi.sistem, isi.pengguna, { temperature: 0.2, maxOutputTokens: 900, maxAttempts: 2 });
    return NextResponse.json({ teks });
  } catch (e) {
    logger.error("ai-cfo/narasi: AI gagal", { error: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "AI tidak tersedia" }, { status: 503 });
  }
}
