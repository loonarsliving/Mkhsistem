import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang menyatukan penilaian progres per blok bangunan (masing-masing sudah dinilai dari foto lapangan oleh Gemini Vision) menjadi satu estimasi progres keseluruhan proyek, untuk ditampilkan di modul Keuangan Proyek Pembangunan. PENTING: kamu tidak melihat foto langsung di sini -- kamu mensintesis data blok yang sudah ada, jadi tetap konservatif dan sebutkan kalau data pendukung tipis (banyak blok tanpa foto minggu ini, dsb). Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface OverallProgressAssessment {
  overallProgressPct: number;
  summary: string;
  concerns: string[];
}

export interface ProgressBlockInput {
  code: string;
  aiStage: string | null;
  aiProgressPct: number | null;
  aiNotes: string | null;
  aiConcerns: string | null;
  photoCount7d: number;
  lastPhotoAt: string | null;
}

function parseAssessment(text: string): OverallProgressAssessment {
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

  const overallProgressPct =
    typeof parsed.overallProgressPct === "number" && Number.isFinite(parsed.overallProgressPct) ? Math.max(0, Math.min(100, Math.round(parsed.overallProgressPct))) : 0;

  return {
    overallProgressPct,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 800) : "",
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .map((c) => c.trim().slice(0, 200))
          .slice(0, 8)
      : [],
  };
}

/**
 * Weekly (Saturday) synthesis over every block's latest AI photo assessment
 * -- "data dari modul" (the block list + each block's already-computed
 * ai_stage/ai_progress_pct/ai_notes/ai_concerns, the same data
 * construction_send_progress_report already aggregates) "ditambah dengan
 * penilaian foto dari AI" (this second-pass holistic synthesis) into one
 * building-wide progress percentage. No image call here -- per-photo Gemini
 * Vision assessment already happened when each photo was sent
 * (construction-progress-vision.ts).
 */
export async function assessOverallProjectProgress(input: { projectName: string; blocks: ProgressBlockInput[] }): Promise<OverallProgressAssessment> {
  const blockLines = input.blocks
    .map((b) => {
      const parts = [`blok ${b.code}`];
      if (b.aiStage) parts.push(`tahap: ${b.aiStage}`);
      if (b.aiProgressPct !== null) parts.push(`estimasi progress: ${b.aiProgressPct}%`);
      parts.push(`${b.photoCount7d} foto 7 hari terakhir`);
      if (b.lastPhotoAt) parts.push(`foto terakhir: ${b.lastPhotoAt}`);
      else parts.push("belum pernah ada foto");
      if (b.aiNotes) parts.push(`catatan: ${b.aiNotes}`);
      if (b.aiConcerns) parts.push(`concern: ${b.aiConcerns}`);
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");

  const userPrompt = `Proyek: ${input.projectName}
Total ${input.blocks.length} blok.

Data progres per blok (hasil penilaian visual AI per foto, sudah ada sebelumnya):
${blockLines || "(tidak ada data blok)"}

Sintesiskan menjadi SATU estimasi progres keseluruhan bangunan (rata-rata sederhana per blok sudah cukup salah kalau ada blok yang jauh lebih besar/kecil dari blok lain -- tapi kamu tidak tahu ukuran relatif tiap blok, jadi anggap kontribusi tiap blok kurang lebih setara kecuali datanya menunjukkan sebaliknya). Pertimbangkan blok yang tidak ada foto sama sekali sebagai sinyal stagnan/belum mulai, bukan diabaikan dari perhitungan.

Hasilkan:
- overallProgressPct: angka 0-100, estimasi progres keseluruhan bangunan
- summary: ringkasan 2-4 kalimat kondisi proyek secara keseluruhan
- concerns: daftar hal yang perlu perhatian (blok stagnan, data foto kurang, dst -- array kosong kalau tidak ada)

Balas HANYA dengan JSON object:
{"overallProgressPct": 0, "summary": "...", "concerns": []}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 1024,
  });
  return parseAssessment(response.text);
}
