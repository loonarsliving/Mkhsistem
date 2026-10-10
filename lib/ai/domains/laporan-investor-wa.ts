import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { sendWhatsAppDocument } from "@/lib/ai/notifications/engine";

/**
 * Laporan Investor lewat WhatsApp (owner 2026-10-10): super admin mengirim
 * "lapkeu" ke nomor sistem, sistem membalas dengan PDF Laporan Investor dari
 * MKH Property (finance.haluoleo.id).
 *
 *   lapkeu                      -> sejak data pertama s.d. bulan ini
 *   lapkeu 2026-09              -> s.d. bulan itu
 *   lapkeu 2026-09 2026-12      -> rentang bulan
 *
 * Hanya dipanggil dari cabang super_admin di webhook-handler.ts. Memakai
 * rahasia sync yang SUDAH ADA (Vault mk_sync_shared_secret lewat RPC
 * get_sync_secret, sama dengan sync ke MKH Property) -- tidak ada rahasia
 * baru. MKH Property membalas tautan unduh sementara (10 menit, maks 3 kali
 * ambil); Whacenter mengambil PDF dari tautan itu. PDF tidak disimpan di MK
 * Connect. Spesifikasi: mkh-properti docs/laporan-investor/03-SPESIFIKASI-MKHSISTEM.md §D.
 */

const LAPKEU_RE = /^\s*lapkeu\b(.*)$/i;
const BULAN_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MKH_PROPERTY_WA_URL = "https://finance.haluoleo.id/api/laporan-investor/wa";

export type LapkeuCommand = { dari?: string; sampai?: string } | { error: string };

/** null kalau bukan perintah lapkeu. */
export function parseLapkeuCommand(text: string): LapkeuCommand | null {
  const match = text.match(LAPKEU_RE);
  if (!match) return null;
  const args = match[1].trim().split(/\s+/).filter(Boolean);
  if (args.length === 0) return {};
  if (args.length > 2 || !args.every((a) => BULAN_RE.test(a))) {
    return { error: "Format: lapkeu, lapkeu 2026-09, atau lapkeu 2026-09 2026-12" };
  }
  if (args.length === 1) return { sampai: args[0] };
  const [a, b] = args[0] <= args[1] ? [args[0], args[1]] : [args[1], args[0]];
  return { dari: a, sampai: b };
}

export type LapkeuOutcome =
  | { outcome: "not_applicable" }
  | { outcome: "sent"; reply: string }
  | { outcome: "failed"; reply: string };

export async function tryHandleLapkeuViaWhatsApp(
  sender: string,
  text: string,
): Promise<LapkeuOutcome> {
  const command = parseLapkeuCommand(text);
  if (!command) return { outcome: "not_applicable" };
  if ("error" in command) return { outcome: "failed", reply: command.error };

  const { data: secret, error: secretError } = await createAdminClient().rpc("get_sync_secret");
  if (secretError || !secret) {
    logger.error("lapkeu: rahasia sync tidak tersedia", { error: secretError?.message });
    return {
      outcome: "failed",
      reply: "⚠️ Laporan Investor sedang tidak bisa dibuat. Coba lagi nanti.",
    };
  }

  let link: { url: string; nama_berkas: string };
  try {
    const res = await fetch(MKH_PROPERTY_WA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": secret },
      body: JSON.stringify({ nomor: sender, ...command }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 429) {
      return {
        outcome: "failed",
        reply: "Terlalu banyak permintaan laporan dalam satu jam. Coba lagi nanti.",
      };
    }
    if (!res.ok) {
      logger.error("lapkeu: MKH Property menolak permintaan tautan", { status: res.status });
      return {
        outcome: "failed",
        reply: "⚠️ Laporan Investor sedang tidak bisa dibuat. Coba lagi nanti.",
      };
    }
    link = (await res.json()) as { url: string; nama_berkas: string };
  } catch (error) {
    logger.error("lapkeu: gagal menghubungi MKH Property", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      outcome: "failed",
      reply: "⚠️ Laporan Investor sedang tidak bisa dibuat. Coba lagi nanti.",
    };
  }

  const sendResult = await sendWhatsAppDocument(sender, link.url, link.nama_berkas);
  if (!sendResult.success) {
    return {
      outcome: "failed",
      reply: "⚠️ Laporan sudah dibuat tapi gagal dikirim sebagai dokumen. Coba kirim lapkeu lagi.",
    };
  }
  const rentang = command.dari
    ? `${command.dari} s.d. ${command.sampai}`
    : command.sampai
      ? `s.d. ${command.sampai}`
      : "sejak data pertama s.d. bulan ini";
  return {
    outcome: "sent",
    reply: `📊 Laporan Investor (${rentang}) terkirim. RAHASIA — jangan diteruskan.`,
  };
}
