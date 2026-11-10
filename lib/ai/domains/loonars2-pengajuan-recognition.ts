import "server-only";

import { generateAIText } from "@/lib/ai/service";

/**
 * Pembaca cadangan pengajuan Loonars 2 (owner 2026-11-10: "kenapa sering tidak bisa pengajuan"). Dipakai HANYA bila
 * pengenal pola di loonars2-wa.ts tidak bisa membaca pesan "L2 ..." yang bernominal — sebelumnya pesan seperti itu
 * dibalas daftar perintah (dalam 30 hari ±27 percobaan Vando gagal).
 *
 * AI hanya MEMBACA baris pembayaran yang tertulis. Setiap angka (nominal, total DP, nomor rekening, nomor unit) lalu
 * dicek di kode (`validasiPengajuanAi` di loonars2-wa.ts) harus benar-benar tertulis di pesan; baris yang angkanya
 * tidak ditemukan dibuang. Persetujuan & pembayaran tetap lewat owner seperti biasa.
 */

const SYSTEM_PROMPT =
  "Kamu membaca pesan WhatsApp pelaksana proyek villa (Loonars 2) yang mengajukan pembayaran. Ambil hanya yang tertulis; jangan menebak, menjumlahkan, membagi, atau menambah baris. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export type JenisBarisAi = "material" | "tukang" | "lain" | "cicilan";

export interface BarisAi {
  deskripsi: string;
  nominal: number | null;
  jenis: JenisBarisAi;
  /** Tulisan rekening tujuan apa adanya (bank, nomor, a.n.) bila ada untuk baris ini. */
  rekening: string | null;
  toko: string | null;
  unit: number[];
  /** Total harga keseluruhan bila baris ini DP/uang muka dan totalnya disebut. */
  total_dp: number | null;
}

export interface PengajuanAi {
  baris: BarisAi[];
  /** Rekening yang disebut sekali untuk semua baris. */
  rekening_umum: string | null;
  notes: string;
}

function angka(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function teks(v: unknown, maks: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, maks) : null;
}

/** Murni (tanpa jaringan) -- diuji di tests/unit/lib/loonars2-pengajuan-recognition.test.ts. */
export function parsePengajuanAi(text: string): PengajuanAi {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI bukan JSON yang valid");
  }
  const baris: BarisAi[] = [];
  if (Array.isArray(parsed.baris)) {
    for (const raw of parsed.baris.slice(0, 20)) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const deskripsi = teks(o.deskripsi, 200);
      if (!deskripsi) continue;
      const jenis: JenisBarisAi = o.jenis === "tukang" || o.jenis === "lain" || o.jenis === "cicilan" ? o.jenis : "material";
      const unit = Array.isArray(o.unit)
        ? [...new Set(o.unit.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 99))].slice(0, 30)
        : [];
      baris.push({ deskripsi, nominal: angka(o.nominal), jenis, rekening: teks(o.rekening, 160), toko: teks(o.toko, 120), unit, total_dp: angka(o.total_dp) });
    }
  }
  return { baris, rekening_umum: teks(parsed.rekening_umum, 160), notes: teks(parsed.notes, 300) ?? "" };
}

export async function recognizePengajuanL2(message: string): Promise<PengajuanAi> {
  const userPrompt = `Pesan WhatsApp pelaksana:

"""
${message}
"""

Tentukan setiap baris pembayaran yang diajukan (satu penerima/pembayaran = satu baris), urut seperti di pesan:
- deskripsi: rincian singkat apa adanya (mis. "pembayaran air kolam 27 okt", "DP kaca", "project BALAS"), tanpa nominal & rekening.
- nominal: jumlah rupiah baris itu persis seperti tertulis (angka penuh, mis. "1,6 jt" -> 1600000); null bila tidak ada.
- jenis: "tukang" bila upah tukang/kontraktor/mandor/borongan; "cicilan" bila bayar cicilan/utang toko; "lain" bila biaya operasional (listrik, air, bensin, sewa, konten, jasa, transport); selain itu "material".
- rekening: tulisan rekening tujuan baris itu (nama bank, nomor, a.n.) bila ada; null bila tidak ada.
- toko: nama toko/penerima bila disebut; null bila tidak.
- unit: nomor unit yang disebut untuk baris itu (angka); [] bila tidak disebut.
- total_dp: bila baris itu DP/uang muka dan total harga keseluruhannya disebut ("dari total 11 jt"), isi angka totalnya; selain itu null.
Juga:
- rekening_umum: rekening yang ditulis sekali untuk semua baris (mis. di baris terakhir), atau null.
- notes: catatan singkat bila ada yang tidak jelas.

Balas HANYA dengan JSON object:
{"baris": [{"deskripsi": "...", "nominal": 0, "jenis": "material", "rekening": null, "toko": null, "unit": [], "total_dp": null}], "rekening_umum": null, "notes": ""}`;

  const response = await generateAIText({ systemPrompt: SYSTEM_PROMPT, userPrompt, responseFormat: "json", maxOutputTokens: 900 });
  return parsePengajuanAi(response.text);
}
