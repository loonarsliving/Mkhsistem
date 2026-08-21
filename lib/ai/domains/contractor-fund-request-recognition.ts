import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca pesan WhatsApp dari kontraktor bangunan untuk memahami apakah pesan itu berisi permintaan dana (uang muka) yang jelas -- ada nominal dan alasannya. Jangan mengarang nominal yang tidak disebutkan. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface FundRequestRecognition {
  isRequest: boolean;
  nominal: number | null;
  keterangan: string | null;
  notes: string;
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
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 300) : "",
  };
}

/**
 * Reads a free-text WhatsApp message from a contractor (currently: Anang)
 * to see if it's a fund-request ("butuh dana 5 juta untuk beli semen dan
 * pasir buat pondasi blok C2") -- extracts the nominal and his explanation
 * of what it's for, exactly as freely worded as he sends it, no rigid
 * command syntax required. Owner's ask: Vando still judges whether the
 * request is reasonable before it goes anywhere -- this only turns a
 * readable request into a pengajuan for Vando to review, never
 * auto-approves anything.
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
- notes: catatan singkat, misalnya kalau ada nominal tapi alasannya tidak jelas

Balas HANYA dengan JSON object:
{"isRequest": true, "nominal": 0, "keterangan": "...", "notes": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 384,
  });
  return parseRecognition(response.text);
}
