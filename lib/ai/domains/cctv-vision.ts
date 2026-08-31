import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang menganalisis satu foto snapshot CCTV dari properti (villa). Tugasmu HANYA memeriksa fakta visual: apakah ada orang yang terlihat di frame. Jangan menilai kinerja, kedisiplinan, kerapian, atau profesionalitas siapa pun -- itu bukan sesuatu yang bisa dinilai dari satu foto diam, dan bukan tugasmu. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface CctvVisionInput {
  imageBase64: string;
  mimeType: string;
  /** e.g. "satpam", "resepsionis", or "area" for a camera without an assigned role yet. */
  zona: string;
}

export interface CctvVisionResult {
  person_present: boolean;
  description: string;
}

function parseCctvVisionJson(text: string): CctvVisionResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons Gemini Vision bukan JSON yang valid");
  }

  if (typeof parsed.person_present !== "boolean") {
    throw new Error("Respons Gemini Vision tidak menyertakan person_present yang valid");
  }

  return {
    person_present: parsed.person_present,
    description: typeof parsed.description === "string" ? parsed.description.trim().slice(0, 500) : "",
  };
}

/**
 * Real Gemini Vision look at one villa CCTV checkpoint snapshot -- called by
 * app/api/villa/ai/cctv-vision/route.ts (the bridge villa's own checkpoint
 * cron calls into, see loonarsliving/villa's src/lib/aiBridge.ts).
 * Deliberately narrow: presence only, no judgment call. Villa's own
 * cctv_disciplinary_reports flow aggregates these into a monthly report a
 * human admin reviews -- the AI here never decides anything disciplinary.
 */
export async function detectPersonInZone(input: CctvVisionInput): Promise<CctvVisionResult> {
  const zonaLabel = input.zona === "satpam" ? "pos satpam" : input.zona === "resepsionis" ? "meja resepsionis" : "area yang difoto";

  const userPrompt = `Ini adalah snapshot dari kamera CCTV yang mengawasi ${zonaLabel} sebuah villa. Lihat gambar ini secara langsung dan jawab satu pertanyaan faktual: apakah ada orang yang terlihat di frame gambar ini?

Balas HANYA dengan JSON object:
{"person_present": true/false, "description": "deskripsi singkat 1 kalimat tentang apa yang terlihat di gambar (netral, faktual, jangan menilai)"}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.mimeType },
    responseFormat: "json",
    maxOutputTokens: 256,
  });
  return parseCctvVisionJson(response.text);
}
