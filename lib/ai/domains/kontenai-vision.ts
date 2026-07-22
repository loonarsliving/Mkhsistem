import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI Digital Asset Management untuk MK Connect, menganalisis aset marketing (foto/video) milik bisnis leasehold properti, villa, dan beauty. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface AssetVisionAnalysisInput {
  filename: string;
  currentTitle: string;
  assetType: "image";
  imageBase64: string;
  imageMimeType: string;
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

/** Real Gemini Vision analysis of an uploaded Asset Library image -- Gemini actually looks at the photo (AIGenerateRequest.image). */
export async function analyzeAssetWithGeminiVision(input: AssetVisionAnalysisInput): Promise<AssetVisionAnalysisResult> {
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

/**
 * Last-resort fallback when ffmpeg keyframe extraction yields zero usable
 * frames (corrupt file, unsupported codec, extraction timeout) -- a
 * filename/context-only best-effort pass that explicitly says it never
 * saw the video, same honesty precedent as reviewContentSubmission in
 * lib/ai/domains/markom.ts. Not used when real frames are available.
 */
export async function analyzeVideoWithoutFrames(filename: string, currentTitle: string): Promise<AssetVisionAnalysisResult> {
  const userPrompt = `Aset ini adalah VIDEO bernama "${filename}" dengan judul saat ini "${currentTitle}". Ekstraksi frame gagal sehingga kamu TIDAK bisa melihat isi videonya sama sekali. Berdasarkan nama file dan judul saja, berikan estimasi terbaik (best-effort).

PENTING: description WAJIB menyebutkan secara eksplisit bahwa ini adalah estimasi karena ekstraksi frame gagal dan AI tidak melihat isi videonya, dan sarankan pengguna memverifikasi manual atau coba "Analyze Again". detectedObjects dan dominantColors WAJIB berupa array kosong [] karena tidak ada akses visual.

Balas HANYA dengan JSON object:
{"title": "...", "description": "... (sebutkan ini estimasi, ekstraksi frame gagal)", "tags": ["...", "..."], "category": "...", "detectedObjects": [], "dominantColors": [], "mood": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 800,
  });
  return parseAssetVisionJson(response.text);
}

/** One real Gemini Vision call per extracted video keyframe -- a short scene caption, not the full structured metadata (that's combineVideoSceneAnalysis's job once every frame has been described). */
export async function analyzeVideoKeyframe(input: { base64: string; mimeType: string; timestampSeconds: number; filename: string }): Promise<string> {
  const userPrompt = `Ini adalah satu frame (detik ke-${input.timestampSeconds}) dari video aset marketing bernama "${input.filename}". Lihat langsung isi gambar ini dan jelaskan secara singkat (1 kalimat, maks 200 karakter) apa yang terlihat di scene ini -- subjek, aktivitas, dan setting.

Balas HANYA dengan JSON object: {"description": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.base64, mimeType: input.mimeType },
    responseFormat: "json",
    maxOutputTokens: 256,
  });

  const cleaned = response.text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { description?: unknown };
    if (typeof parsed.description === "string" && parsed.description.trim()) {
      return parsed.description.trim().slice(0, 300);
    }
  } catch {
    // fall through to raw-text fallback below
  }
  return cleaned.slice(0, 300) || "Scene tidak dapat dijelaskan.";
}

export interface VideoSceneDescription {
  timestampSeconds: number;
  description: string;
}

/**
 * Combines every keyframe's scene caption (analyzeVideoKeyframe) into one
 * consolidated video-level metadata result -- the "gabungkan hasil analisis
 * menjadi satu metadata video" step. Text-only call (no image attached);
 * the visual grounding already happened per-frame.
 */
export async function combineVideoSceneAnalysis(input: {
  filename: string;
  currentTitle: string;
  durationSeconds: number | null;
  scenes: VideoSceneDescription[];
}): Promise<AssetVisionAnalysisResult> {
  const sceneLines = input.scenes.map((scene) => `- Detik ${scene.timestampSeconds}: ${scene.description}`).join("\n");
  const durationLine = input.durationSeconds ? `Durasi video: ${Math.round(input.durationSeconds)} detik.` : "";

  const userPrompt = `Video aset marketing bernama "${input.filename}" (judul saat ini: "${input.currentTitle}") telah dianalisis frame-by-frame. ${durationLine}

Berikut deskripsi tiap scene berdasarkan urutan waktu:
${sceneLines}

Gabungkan seluruh scene di atas menjadi SATU metadata video yang koheren (bukan sekadar mengulang tiap scene satu-satu):
- title: judul singkat yang deskriptif untuk keseluruhan video (maks 60 karakter)
- description: ringkasan 1-3 kalimat tentang keseluruhan video, menangkap alur/narasi dari scene-scene tersebut
- tags: 5-8 tag relevan (lowercase, kata tunggal atau kebab-case)
- category: satu kategori umum yang paling sesuai (misal: interior, eksterior, produk, lifestyle, before-after, tim, event, lainnya)
- detectedObjects: daftar objek/elemen visual utama yang muncul di scene-scene tersebut (gabungan, tanpa duplikat)
- dominantColors: 3-5 warna dominan yang paling sering muncul (nama warna sederhana dalam Bahasa Indonesia)
- mood: mood/nuansa visual keseluruhan video (misal "hangat", "profesional", "ceria", "elegan", "santai")

Balas HANYA dengan JSON object:
{"title": "...", "description": "...", "tags": ["...", "..."], "category": "...", "detectedObjects": ["...", "..."], "dominantColors": ["...", "..."], "mood": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 1024,
  });
  return parseAssetVisionJson(response.text);
}
