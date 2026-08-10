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
    // TEMPORARY: include the raw text (truncated) so tryTrackConstructionProgressPhoto's
    // catch block can persist it into ai_notes for production debugging --
    // remove once the root cause of any future parse failure is confirmed.
    throw new Error(`Respons Gemini Vision bukan JSON yang valid. Raw: ${cleaned.slice(0, 300) || "(empty)"}`);
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
export async function assessConstructionProgress(input: { blockCode: string; caption?: string; imageBase64: string; imageMimeType: string }): Promise<ConstructionProgressAssessment> {
  const captionLine = input.caption ? `\n\nKeterangan yang ditulis pengawas saat mengirim foto ini: "${input.caption}"` : "";

  const userPrompt = `Ini adalah foto sore hari lokasi pembangunan blok ${input.blockCode} (proyek villa Loonars Living). Lihat langsung isi foto ini dan nilai progres pekerjaan konstruksinya.${captionLine}

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
  /** TEMPORARY debug channel -- set only on failure, so the caller can persist *why* the fetch failed (this branch previously discarded that entirely, the reason a whole round of debugging looked like a Gemini/JSON-parsing bug when it was actually the image fetch failing). Remove once root-caused. */
  fetchError?: string;
}

/** Fetches a WhatsApp media URL's bytes and base64-encodes them for Gemini Vision -- no existing helper does this from a remote URL (kontenai-vision.ts's callers all start from an already-uploaded file). Returns null only on a thrown exception; an HTTP error response is reported via fetchError on a dummy object so the reason is visible. */
export async function fetchImageAsBase64(url: string): Promise<FetchImageResult | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { data: "", mimeType: "", fetchError: `HTTP ${res.status} ${res.statusText}` };
    }
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const mimeType = contentType.split(";")[0].trim() || "image/jpeg";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length === 0) {
      return { data: "", mimeType: "", fetchError: "empty response body" };
    }
    return { data: buffer.toString("base64"), mimeType };
  } catch (err) {
    return { data: "", mimeType: "", fetchError: err instanceof Error ? err.message : String(err) };
  }
}
