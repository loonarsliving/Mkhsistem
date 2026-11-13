import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang menilai progres pembangunan villa/rumah dari sebuah foto lokasi proyek, untuk membantu Kepala Cabang memperkirakan progres pekerjaan tukang per blok sebelum penggajian mingguan. PENTING: penilaianmu HANYA perkiraan visual dari SATU foto, bukan pengukuran pasti -- selalu bersikap konservatif dan sebutkan kalau ada ketidakpastian. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface ConstructionProgressAssessment {
  stage: string;
  progressPct: number;
  notes: string;
  concerns: string[];
  plannedWorkTomorrow: string | null;
  materialsNeededTomorrow: string | null;
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
    plannedWorkTomorrow: typeof parsed.plannedWorkTomorrow === "string" && parsed.plannedWorkTomorrow.trim() ? parsed.plannedWorkTomorrow.trim().slice(0, 300) : null,
    materialsNeededTomorrow:
      typeof parsed.materialsNeededTomorrow === "string" && parsed.materialsNeededTomorrow.trim() ? parsed.materialsNeededTomorrow.trim().slice(0, 300) : null,
  };
}

/**
 * Real Gemini Vision call -- Gemini actually looks at the photo
 * (AIGenerateRequest.image), same mechanism as analyzeAssetWithGeminiVision
 * (kontenai-vision.ts). Endy's routine (owner's clarification): every
 * afternoon, 3 photos per building with a caption stating tomorrow's
 * planned work and material needs -- that caption is what he bases
 * tomorrow morning's pengajuan on, and it's also useful context for the
 * vision assessment itself (e.g. "if he said pengecoran was planned today,
 * does the photo show it happened"), so it's passed alongside the image
 * rather than parsed separately.
 */
export async function assessConstructionProgress(input: {
  blockCode: string;
  caption?: string;
  imageBase64: string;
  imageMimeType: string;
  /** Human-readable project label for the prompt, e.g. "proyek Loonars Coffee (Yogyakarta)". Defaults to the original Loonars Living villa wording so every existing caller is unaffected. */
  projectLabel?: string;
}): Promise<ConstructionProgressAssessment> {
  const captionLine = input.caption ? `\n\nKeterangan yang ditulis pengawas saat mengirim foto ini: "${input.caption}"` : "";
  const projectLabel = input.projectLabel ?? "proyek villa Loonars Living";

  const userPrompt = `Ini adalah foto sore hari lokasi pembangunan blok/zona ${input.blockCode} (${projectLabel}). Lihat langsung isi foto ini dan nilai progres pekerjaan konstruksinya.${captionLine}

Hasilkan:
- stage: tahap pekerjaan yang terlihat (misal: "Pondasi", "Struktur/Dinding", "Atap", "Finishing", "Selesai")
- progressPct: perkiraan persentase progres keseluruhan bangunan (0-100), berdasarkan HANYA apa yang terlihat di foto ini
- notes: catatan singkat 1-2 kalimat tentang apa yang terlihat di foto, termasuk apakah sesuai dengan keterangan pengawas (kalau ada keterangan)
- concerns: daftar hal yang perlu diperhatikan (kalau ada) -- misal pekerjaan terlihat lambat/tidak rapi/tidak sesuai keterangan -- array kosong kalau tidak ada
- plannedWorkTomorrow: kalau keterangan pengawas menyebutkan rencana pekerjaan besok, tuliskan ringkas di sini -- null kalau tidak disebutkan
- materialsNeededTomorrow: kalau keterangan pengawas menyebutkan bahan yang dibutuhkan besok, tuliskan ringkas di sini -- null kalau tidak disebutkan

Balas HANYA dengan JSON object:
{"stage": "...", "progressPct": 0, "notes": "...", "concerns": [], "plannedWorkTomorrow": null, "materialsNeededTomorrow": null}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.imageBase64, mimeType: input.imageMimeType },
    responseFormat: "json",
    // 512 truncated the response mid-JSON once the two extra plan/material
    // fields were added (confirmed against production: a successful, fast
    // Gemini call whose text failed to JSON.parse) -- room for a fuller
    // notes/concerns/plan/material set of fields.
    maxOutputTokens: 1024,
  });
  return parseAssessment(response.text);
}

export interface FetchImageResult {
  data: string;
  mimeType: string;
  /** Set only when the fetch failed (non-2xx response, empty body, or a thrown exception) -- e.g. an expired WhatsApp media URL or a rejected thumbnail size, so the caller can record *why* a photo never got assessed instead of a silent null. */
  fetchError?: string;
}

/** Fetches a WhatsApp media URL's bytes and base64-encodes them for Gemini Vision -- no existing helper does this from a remote URL (kontenai-vision.ts's callers all start from an already-uploaded file). */
export async function fetchImageAsBase64(url: string, options: { attempts?: number; retryDelayMs?: number } = {}): Promise<FetchImageResult | null> {
  // Real incident (2026-11-13): Whacenter fired the webhook the same second
  // the photo was sent, the media URL wasn't downloadable yet, and the one
  // and only fetch failed -- so the bukti transfer was never read by the AI
  // at all. A short retry covers that "media not ready yet" window.
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 1500;
  let last: FetchImageResult | null = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    last = await fetchImageOnce(url);
    if (!last.fetchError) return last;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  return last;
}

async function fetchImageOnce(url: string): Promise<FetchImageResult> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { data: "", mimeType: "", fetchError: `HTTP ${res.status} ${res.statusText}` };
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    // A 200 carrying a JSON/HTML error page instead of the picture is the
    // same "not ready" failure wearing a success status.
    if (/^(application\/json|text\/)/i.test(mimeType)) {
      return { data: "", mimeType: "", fetchError: `unexpected content-type ${mimeType}` };
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      return { data: "", mimeType: "", fetchError: "empty response body" };
    }
    return { data: buffer.toString("base64"), mimeType };
  } catch (err) {
    return { data: "", mimeType: "", fetchError: err instanceof Error ? err.message : String(err) };
  }
}
