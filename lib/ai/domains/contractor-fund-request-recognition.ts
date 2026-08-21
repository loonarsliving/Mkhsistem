import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca pesan WhatsApp dari kontraktor bangunan untuk memahami apakah pesan itu berisi permintaan dana (uang muka) yang jelas -- ada rincian barang/kebutuhan dengan nilainya masing-masing (atau setidaknya total nominalnya), dan apakah ini untuk gaji/upah tukang atau untuk beli material. Jangan mengarang nominal, item, atau kategori yang tidak jelas dari pesannya. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export type FundRequestKategori = "gaji" | "material";

export interface FundRequestItem {
  nama: string;
  harga: number;
}

export interface FundRequestRecognition {
  isRequest: boolean;
  /** Every line item he listed with its own value, e.g. "taco vinyl Rp 500rb, lem Rp 200rb". Empty array if he only gave one lump-sum total with no breakdown. */
  items: FundRequestItem[];
  /** Total nominal requested -- his stated total if he gave one explicitly, otherwise the sum of items. */
  nominal: number | null;
  /** null when the message doesn't make clear whether this is for gaji or material -- caller must ask him to clarify, never guess. */
  kategori: FundRequestKategori | null;
  notes: string;
}

function parseItems(value: unknown): FundRequestItem[] {
  if (!Array.isArray(value)) return [];
  const items: FundRequestItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const nama = (raw as Record<string, unknown>).nama;
    const harga = (raw as Record<string, unknown>).harga;
    if (typeof nama === "string" && nama.trim() && typeof harga === "number" && Number.isFinite(harga) && harga > 0) {
      items.push({ nama: nama.trim().slice(0, 200), harga });
    }
  }
  return items;
}

function parseKategori(value: unknown): FundRequestKategori | null {
  return value === "gaji" || value === "material" ? value : null;
}

function parseRecognition(text: string): FundRequestRecognition {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI bukan JSON yang valid");
  }

  return {
    isRequest: parsed.isRequest === true,
    items: parseItems(parsed.items),
    nominal: typeof parsed.nominal === "number" && Number.isFinite(parsed.nominal) && parsed.nominal > 0 ? parsed.nominal : null,
    kategori: parseKategori(parsed.kategori),
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a free-text WhatsApp message from a contractor (currently: Anang)
 * to see if it's a fund-request ("butuh dana untuk beli taco vinyl 500rb,
 * lem 200rb, semen 1jt buat pondasi blok C2") -- extracts EVERY item he
 * listed with its own value (not one combined summary), the total, and
 * whether it's gaji/upah tukang (paid weekly, Saturdays) or material,
 * exactly as freely worded as he sends it, no rigid command syntax
 * required. Owner's ask: Vando still judges whether the request is
 * reasonable before it goes anywhere, and needs the same per-item
 * breakdown a nota photo would give him -- this only turns a readable
 * request into a pengajuan for Vando to review, never auto-approves
 * anything.
 */
export async function recognizeFundRequestText(message: string): Promise<FundRequestRecognition> {
  const userPrompt = `Ini pesan WhatsApp dari seorang kontraktor bangunan:

"""
${message}
"""

Baca dan tentukan:
- isRequest: true kalau pesan ini JELAS berisi permintaan dana/uang muka dengan nilai yang disebutkan, false kalau ini cuma obrolan biasa/pertanyaan/tidak menyebutkan nilai sama sekali
- items: DAFTAR setiap barang/kebutuhan yang dia sebutkan beserta nilainya masing-masing, JANGAN digabung jadi satu -- satu entri per barang/kebutuhan:
  - nama: nama barang/kebutuhan seperti disebutkan dia
  - harga: nilai untuk barang/kebutuhan itu, angka murni tanpa "Rp"/titik/koma
  (array kosong kalau dia cuma sebutkan satu nominal total tanpa rincian per barang)
- nominal: TOTAL dana yang diminta -- pakai total yang dia sebutkan eksplisit kalau ada, atau jumlahkan semua items kalau tidak ada total eksplisit (null kalau isRequest false atau nilai tidak jelas sama sekali)
- kategori: "gaji" kalau ini untuk membayar gaji/upah tukang/pekerja, "material" kalau ini untuk membeli bahan bangunan/material, atau null kalau dari pesannya TIDAK JELAS yang mana (jangan menebak -- kalau ragu, null)
- notes: catatan singkat, misalnya kalau ada nominal tapi rinciannya/kategorinya tidak jelas

Balas HANYA dengan JSON object:
{"isRequest": true, "items": [{"nama": "...", "harga": 0}], "nominal": 0, "kategori": null, "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 512,
  });
  return parseRecognition(response.text);
}
