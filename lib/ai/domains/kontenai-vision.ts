import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI Digital Asset Management untuk MK Connect, menganalisis aset marketing (foto/video) milik bisnis leasehold properti, villa, dan beauty. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface AssetVisionAnalysisInput {
  filename: string;
  currentTitle: string;
  assetType: "image" | "video";
  /** Only set for images -- Gemini can actually look at the photo (AIGenerateRequest.image). There is no frame-level vision for video in this codebase (same limitation as reviewContentSubmission in lib/ai/domains/markom.ts), so video gets a best-effort, filename/context-only analysis that says so explicitly. */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface AssetVisionAnalysisResult {
  title: string;
  description: string;
  tags: string[];
  category: string;
  detectedObjects: string[];
  dominantColors: string[];
  mood: string;
}

function asStringArray(value: unknown, maxItems: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().slice(0, 60))
    .slice(0, maxItems);
}

function parseAssetVisionJson(text: string): AssetVisionAnalysisResult {
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

  if (typeof parsed.title !== "string" || parsed.title.trim().length === 0) {
    throw new Error("Respons Gemini Vision tidak menyertakan title yang valid");
  }
  if (typeof parsed.description !== "string" || parsed.description.trim().length === 0) {
    throw new Error("Respons Gemini Vision tidak menyertakan description yang valid");
  }

  return {
    title: parsed.title.trim().slice(0, 120),
    description: parsed.description.trim().slice(0, 1000),
    tags: asStringArray(parsed.tags, 10),
    category: typeof parsed.category === "string" && parsed.category.trim() ? parsed.category.trim().slice(0, 60) : "lainnya",
    detectedObjects: asStringArray(parsed.detectedObjects, 15),
    dominantColors: asStringArray(parsed.dominantColors, 6),
    mood: typeof parsed.mood === "string" && parsed.mood.trim() ? parsed.mood.trim().slice(0, 60) : "netral",
  };
}

/**
 * Sends an uploaded Asset Library image to Gemini Vision for real visual
 * analysis, or runs a best-effort filename/context-only pass for video
 * (no frame-level video understanding exists in this codebase -- see
 * lib/ai/domains/markom.ts's reviewContentSubmission for the same
 * precedent). Never throws on a malformed model response without
 * surfacing a clear error message the caller can save/display.
 */
export async function analyzeAssetWithGeminiVision(input: AssetVisionAnalysisInput): Promise<AssetVisionAnalysisResult> {
  if (input.assetType === "image" && input.imageBase64 && input.imageMimeType) {
    const userPrompt = `Analisis gambar aset marketing ini secara langsung (nama file: "${input.filename}", judul saat ini: "${input.currentTitle}"). Benar-benar lihat isi gambarnya.

Hasilkan:
- title: judul singkat yang deskriptif berdasarkan isi gambar (maks 60 karakter)
- description: deskripsi 1-2 kalimat tentang isi gambar
- tags: 5-8 tag relevan (lowercase, kata tunggal atau kebab-case)
- category: satu kategori umum yang paling sesuai (misal: interior, eksterior, produk, lifestyle, before-after, tim, event, lainnya)
- detectedObjects: daftar objek/elemen visual utama yang benar-benar terlihat di gambar
- dominantColors: 3-5 warna dominan (nama warna sederhana dalam Bahasa Indonesia, misal "biru tua", "putih", "emas")
- mood: mood/nuansa visual gambar (misal "hangat", "profesional", "ceria", "elegan", "santai")

Balas HANYA dengan JSON object:
{"title": "...", "description": "...", "tags": ["...", "..."], "category": "...", "detectedObjects": ["...", "..."], "dominantColors": ["...", "..."], "mood": "..."}`;

    const response = await generateAIText({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      image: { data: input.imageBase64, mimeType: input.imageMimeType },
      responseFormat: "json",
      maxOutputTokens: 1024,
    });
    return parseAssetVisionJson(response.text);
  }

  const userPrompt = `Aset ini adalah VIDEO bernama "${input.filename}" dengan judul saat ini "${input.currentTitle}". Kamu TIDAK bisa menonton isi videonya -- tidak ada kemampuan analisis frame video. Berdasarkan nama file dan judul saja, berikan estimasi terbaik (best-effort).

PENTING: description WAJIB menyebutkan secara eksplisit bahwa ini adalah estimasi karena AI tidak menonton isi videonya, dan sarankan pengguna memverifikasi manual. detectedObjects dan dominantColors WAJIB berupa array kosong [] karena tidak ada akses visual.

Balas HANYA dengan JSON object:
{"title": "...", "description": "... (sebutkan ini estimasi, AI tidak menonton video)", "tags": ["...", "..."], "category": "...", "detectedObjects": [], "dominantColors": [], "mood": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 800,
  });
  return parseAssetVisionJson(response.text);
}
