import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang melihat satu foto snapshot CCTV untuk mencatat KEHADIRAN orang saja -- bukan menilai kinerja, kedisiplinan, atau perilaku. Jawab HANYA berdasarkan apa yang benar-benar terlihat di gambar, jangan mengarang. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface VillaCctvDetection {
  person_present: boolean;
  description: string;
}

function parseDetection(text: string): VillaCctvDetection {
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
    person_present: parsed.person_present === true,
    description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 300) : "",
  };
}

/**
 * Villa's AI CCTV checkpoint bridge (see app/api/villa/ai/cctv-vision).
 * Reads one EZVIZ snapshot and answers only a factual presence question --
 * is a person visible in this zona (satpam/resepsionis/area) -- same
 * mechanism as recognizeExpenseReceipt (real Gemini Vision call via the AI
 * Service). Deliberately never asked to judge professionalism or issue any
 * disciplinary verdict; that stays a human (Villa admin) decision made later
 * from the monthly report -- this only produces the raw presence record.
 */
export async function detectPersonInZone(input: { imageBase64: string; imageMimeType: string; zona: string }): Promise<VillaCctvDetection> {
  const userPrompt = `Ini adalah satu foto snapshot dari kamera CCTV yang mengawasi area/pos: "${input.zona}".

Lihat langsung isi gambar ini dan jawab:
- person_present: true kalau ada orang yang terlihat jelas di area/pos itu pada foto ini, false kalau tidak ada orang terlihat
- description: satu kalimat singkat objektif tentang apa yang terlihat di foto (mis. "Terlihat satu orang berdiri di dekat meja resepsionis" atau "Area kosong, tidak ada orang terlihat"). Jangan menilai kinerja atau kedisiplinan, hanya deskripsikan apa yang tampak.

Balas HANYA dengan JSON object:
{"person_present": true, "description": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    maxOutputTokens: 400,
  });
  return parseDetection(response.text);
}
