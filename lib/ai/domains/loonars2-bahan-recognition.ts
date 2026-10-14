import "server-only";

import { generateAIText } from "@/lib/ai/service";

/**
 * Pembaca pesanan bahan kolektif Loonars 2. Pelaksana memesan bahan untuk SEMUA unit yang sedang dibangun
 * ("L2 bahan TB Maju semen 100 sak, pasir 12 rit, besi 2 ton 25 juta"). AI hanya MEMBACA: daftar item,
 * jumlah, harga per item yang disebut, dan catatan "untuk unit ..." per item. Pembagian rupiah/jumlah ke unit
 * dihitung di database (rupiah bulat, jumlah persis), bukan oleh model.
 */

const SYSTEM_PROMPT =
  "Kamu membaca pesan WhatsApp pelaksana proyek villa (Loonars 2) yang memesan bahan bangunan untuk seluruh unit yang sedang dibangun. Ambil hanya yang tertulis di pesan; jangan menebak, menghitung pembagian, atau menambah item. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface BahanItem {
  nama: string;
  qty: number | null;
  satuan: string | null;
  /** Harga item ini (rupiah) HANYA bila disebut sendiri di pesan; null bila hanya ada total. */
  nilai: number | null;
  /** Nomor unit yang disebut khusus untuk item ini; null = tidak disebut (dibagi ke semua unit yang sedang dibangun). */
  untukUnit: number[] | null;
}

export interface BahanRecognition {
  toko: string | null;
  /** Pembelian secara utang (disebut utang/hutang/ngutang/bon/kredit). */
  utang: boolean;
  /** Total pesanan (rupiah) bila disebut atau bisa dijumlahkan dari harga item; null bila tidak jelas. */
  nominal: number | null;
  items: BahanItem[];
  notes: string;
}

function angkaPositif(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function nomorUnit(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const hasil = [...new Set(v.filter((n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= 99))].slice(0, 30);
  return hasil.length > 0 ? hasil : null;
}

/** Murni (tanpa jaringan) -- diuji di tests/unit/lib/loonars2-bahan-recognition.test.ts. */
export function parseBahanRecognition(text: string): BahanRecognition {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI bukan JSON yang valid");
  }

  const items: BahanItem[] = [];
  if (Array.isArray(parsed.items)) {
    for (const raw of parsed.items.slice(0, 40)) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      if (typeof o.nama !== "string" || !o.nama.trim()) continue;
      const nilai = angkaPositif(o.nilai);
      items.push({
        nama: o.nama.trim().slice(0, 120),
        qty: angkaPositif(o.qty),
        satuan: typeof o.satuan === "string" && o.satuan.trim() ? o.satuan.trim().slice(0, 30) : null,
        nilai: nilai !== null ? Math.round(nilai) : null,
        untukUnit: nomorUnit(o.untukUnit),
      });
    }
  }
  const eksplisit = angkaPositif(parsed.nominal);
  const jumlahNilai = items.length > 0 && items.every((i) => i.nilai !== null) ? items.reduce((s, i) => s + (i.nilai ?? 0), 0) : null;
  return {
    toko: typeof parsed.toko === "string" && parsed.toko.trim() ? parsed.toko.trim().slice(0, 150) : null,
    utang: parsed.utang === true,
    nominal: eksplisit !== null ? Math.round(eksplisit) : jumlahNilai,
    items,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

export async function recognizeBahanPesanan(message: string): Promise<BahanRecognition> {
  const userPrompt = `Pesan WhatsApp pelaksana:

"""
${message}
"""

Baca dan tentukan:
- toko: nama toko/supplier bila disebut, selain itu null.
- utang: true bila pembelian secara utang/hutang/ngutang/bon/kredit, selain itu false.
- nominal: total pesanan dalam rupiah bila disebut, atau jumlah harga item bila SEMUA item punya harga; selain itu null.
- items: setiap bahan yang dipesan, urut seperti di pesan:
  - nama: nama bahan (mis. "semen", "pasir", "besi 10mm").
  - qty: jumlah (angka) bila disebut, selain itu null.
  - satuan: sak, rit, batang, dus, kg, m3, dst; null bila tidak disebut.
  - nilai: harga item itu dalam rupiah HANYA bila harga item itu disebut sendiri; jangan membagi total, jangan menebak; selain itu null.
  - untukUnit: array nomor unit (angka) HANYA bila pesan menyebut bahan itu untuk unit/blok tertentu (mis. "pondasi unit 1-3" -> [1,2,3], "sisanya unit 4 dan 5" -> [4,5]); bila tidak disebut -> null (artinya dibagi ke semua unit yang sedang dibangun).
- notes: catatan singkat bila ada yang tidak jelas.

Balas HANYA dengan JSON object:
{"toko": null, "utang": false, "nominal": null, "items": [{"nama": "...", "qty": null, "satuan": null, "nilai": null, "untukUnit": null}], "notes": ""}`;

  const response = await generateAIText({ systemPrompt: SYSTEM_PROMPT, userPrompt, responseFormat: "json", maxOutputTokens: 768 });
  return parseBahanRecognition(response.text);
}
