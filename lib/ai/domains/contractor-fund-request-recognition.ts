import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca pesan WhatsApp dari kontraktor bangunan untuk memahami apakah pesan itu berisi permintaan dana (uang muka) yang jelas -- ada nominal dan alasannya -- dan apakah ini untuk gaji/upah tukang atau untuk beli material. Jangan mengarang nominal atau kategori yang tidak jelas dari pesannya. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export type FundRequestKategori = "gaji" | "material";

export interface FundRequestRecognition {
  isRequest: boolean;
  nominal: number | null;
  keterangan: string | null;
  /** null when isRequest is true but the message doesn't make clear whether this is for gaji or material -- caller must ask him to clarify, never guess. */
  kategori: FundRequestKategori | null;
  notes: string;
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
    nominal: typeof parsed.nominal === "number" && Number.isFinite(parsed.nominal) && parsed.nominal > 0 ? parsed.nominal : null,
    keterangan: typeof parsed.keterangan === "string" && parsed.keterangan.trim() ? parsed.keterangan.trim().slice(0, 300) : null,
    kategori: parseKategori(parsed.kategori),
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a free-text WhatsApp message from a contractor (currently: Anang)
 * to see if it's a fund-request ("butuh dana 5 juta untuk beli semen dan
 * pasir buat pondasi blok C2") -- extracts the nominal, his explanation of
 * what it's for, and whether it's gaji/upah tukang (paid weekly, Saturdays)
 * or material, exactly as freely worded as he sends it, no rigid command
 * syntax required. Owner's ask: split these into their real accounting
 * categories instead of lumping everything into one "Biaya Subkontraktor"
 * bucket -- kategori is null (never guessed) when the message doesn't make
 * this clear, so the caller can ask him to clarify instead of miscategorizing
 * real bookkeeping. Vando still judges whether the request itself is
 * reasonable before it goes anywhere -- this only turns a readable request
 * into a pengajuan for Vando to review, never auto-approves anything.
 */
export async function recognizeFundRequestText(message: string): Promise<FundRequestRecognition> {
  const userPrompt = `Ini pesan WhatsApp dari seorang kontraktor bangunan:

"""
${message}
"""

Baca dan tentukan:
- isRequest: true kalau pesan ini JELAS berisi permintaan dana/uang muka dengan nominal yang disebutkan, false kalau ini cuma obrolan biasa/pertanyaan/tidak menyebutkan nominal sama sekali
- nominal: jumlah dana yang diminta, sebagai angka murni tanpa "Rp"/titik/koma (null kalau isRequest false atau nominal tidak jelas)
- keterangan: ringkasan 1 kalimat untuk apa dana ini dibutuhkan, berdasarkan penjelasan dia sendiri (null kalau isRequest false)
- kategori: "gaji" kalau ini untuk membayar gaji/upah tukang/pekerja, "material" kalau ini untuk membeli bahan bangunan/material, atau null kalau dari pesannya TIDAK JELAS yang mana (jangan menebak -- kalau ragu, null)
- notes: catatan singkat, misalnya kalau ada nominal tapi alasannya/kategorinya tidak jelas

Balas HANYA dengan JSON object:
{"isRequest": true, "nominal": 0, "keterangan": "...", "kategori": null, "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 384,
  });
  return parseRecognition(response.text);
}
