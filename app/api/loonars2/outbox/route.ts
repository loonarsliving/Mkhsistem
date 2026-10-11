import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { flushLoonars2Outbox } from "@/lib/ai/domains/loonars2-wa";
import { logger } from "@/lib/logger";
import { getClientIp, recordAuthFailure } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dibangunkan pg_cron MKH Property (mkh-properti migrasi 0043,
 * loonars2_outbox_bangunkan) setiap menit bila ada pesan WA Loonars 2 yang
 * antre: pengingat transfer, rekap pagi, pengingat pelunasan, laporan
 * mingguan, perintah transfer dari web, kabar pengajuan. Route ini mengambil
 * antrean itu dari MKH Property dan mengirimnya lewat Whacenter yang sudah
 * ada -- tidak ada isi pesan yang diterima dari body permintaan ini.
 *
 * Dijaga header x-sync-secret = rahasia sync yang SUDAH ADA (Vault
 * mk_sync_shared_secret di kedua database; dibaca lewat get_sync_secret),
 * tidak ada rahasia baru.
 */
function cocok(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  if (x.length !== y.length) {
    timingSafeEqual(y, y);
    return false;
  }
  return timingSafeEqual(x, y);
}

export async function POST(request: Request) {
  const { data: expected } = await createAdminClient().rpc("get_sync_secret");
  const provided = (request.headers.get("x-sync-secret") ?? "").trim();
  if (!expected || !cocok(provided, String(expected))) {
    if (recordAuthFailure(`loonars2-outbox:${getClientIp(request)}`)) {
      return NextResponse.json({ error: "too many attempts" }, { status: 429 });
    }
    logger.warn("loonars2/outbox: x-sync-secret tidak cocok");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const hasil = await flushLoonars2Outbox();
  if (hasil.gagal > 0) logger.warn("loonars2/outbox: sebagian pesan gagal dikirim", hasil);
  return NextResponse.json(hasil);
}
