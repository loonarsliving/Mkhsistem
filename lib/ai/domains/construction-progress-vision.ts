import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang menilai progres pembangunan villa/rumah dari sebuah foto lokasi proyek, untuk membantu Kepala Cabang memperkirakan progres pekerjaan tukang per blok sebelum penggajian mingguan. PENTING: penilaianmu HANYA perkiraan visual dari SATU foto, bukan pengukuran pasti -- selalu bersikap konservatif dan sebutkan kalau ada ketidakpastian. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface ConstructionProgressAssessment {
  stage: string;
  progressPct: number;
  notes: string;
  concerns: string[];
}

function parseAssessment(text: string): ConstructionProgressAssessment {
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

  const progressPct = typeof parsed.progressPct === "number" && Number.isFinite(parsed.progressPct) ? Math.max(0, Math.min(100, Math.round(parsed.progressPct))) : 0;

  return {
    stage: typeof parsed.stage === "string" && parsed.stage.trim() ? parsed.stage.trim().slice(0, 80) : "Tidak diketahui",
    progressPct,
    notes: typeof parsed.notes === "string" ? parsed.notes.trim().slice(0, 400) : "",
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .map((c) => c.trim().slice(0, 150))
          .slice(0, 5)
      : [],
  };
}

/** Real Gemini Vision call -- Gemini actually looks at the photo (AIGenerateRequest.image), same mechanism as analyzeAssetWithGeminiVision (kontenai-vision.ts). */
export async function assessConstructionProgress(input: { blockCode: string; imageBase64: string; imageMimeType: string }): Promise<ConstructionProgressAssessment> {
  const userPrompt = `Ini adalah foto lokasi pembangunan blok ${input.blockCode} (proyek villa Loonars Living). Lihat langsung isi foto ini dan nilai progres pekerjaan konstruksinya.

Hasilkan:
- stage: tahap pekerjaan yang terlihat (misal: "Pondasi", "Struktur/Dinding", "Atap", "Finishing", "Selesai")
- progressPct: perkiraan persentase progres keseluruhan bangunan (0-100), berdasarkan HANYA apa yang terlihat di foto ini
- notes: catatan singkat 1-2 kalimat tentang apa yang terlihat di foto
- concerns: daftar hal yang perlu diperhatikan (kalau ada) -- misal pekerjaan terlihat lambat/tidak rapi -- array kosong kalau tidak ada

Balas HANYA dengan JSON object:
{"stage": "...", "progressPct": 0, "notes": "...", "concerns": []}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    maxOutputTokens: 512,
  });
  return parseAssessment(response.text);
}

/** Fetches a WhatsApp media URL's bytes and base64-encodes them for Gemini Vision -- no existing helper does this from a remote URL (kontenai-vision.ts's callers all start from an already-uploaded file). */
export async function fetchImageAsBase64(url: string): Promise<{ data: string; mimeType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    return { data: buffer.toString("base64"), mimeType };
  } catch {
    return null;
  }
}
