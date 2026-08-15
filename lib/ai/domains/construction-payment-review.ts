import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membantu Kepala Cabang/Finance menilai kewajaran satu pembayaran borongan mingguan tukang, dengan membandingkan klaim progress (dasar perhitungan pembayaran) terhadap bukti foto lapangan yang sudah dinilai sebelumnya. PENTING: kamu tidak melihat foto langsung di sini -- kamu hanya mensintesis hasil penilaian visual yang sudah ada per foto, jadi tetap bersikap konservatif dan sebutkan kalau data pendukung tipis (misal foto sedikit atau tidak ada di periode ini). Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface PaymentAiReview {
  verdict: "sesuai" | "perlu_dicek" | "tidak_sesuai";
  summary: string;
  concerns: string[];
}

export interface PaymentReviewWbsLine {
  name: string;
  weightPct: number;
  progressPct: number;
  lastPaidProgressPct: number;
}

export interface PaymentReviewPhoto {
  reportDate: string;
  employeeName: string;
  caption: string | null;
  aiStage: string | null;
  aiProgressPct: number | null;
  aiNotes: string | null;
  aiConcerns: string | null;
}

function parseReview(text: string): PaymentAiReview {
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

  const verdict = typeof parsed.verdict === "string" && ["sesuai", "perlu_dicek", "tidak_sesuai"].includes(parsed.verdict) ? (parsed.verdict as PaymentAiReview["verdict"]) : "perlu_dicek";

  return {
    verdict,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 600) : "",
    concerns: Array.isArray(parsed.concerns)
      ? parsed.concerns
          .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
          .map((c) => c.trim().slice(0, 200))
          .slice(0, 6)
      : [],
  };
}

/**
 * Text-only synthesis over already-assessed daily photos (Fasly/Endy's
 * routine) vs. the WBS progress claim behind this week's borongan payment.
 * No image call here -- assessConstructionProgress() already did the visual
 * work per photo when it was sent; this cross-references that history
 * against the payment being reviewed right now.
 */
export async function reviewLaborPayment(input: {
  contractorName: string;
  projectName: string;
  periodStart: string;
  periodEnd: string;
  grossEarned: number;
  wbsBreakdown: PaymentReviewWbsLine[];
  photos: PaymentReviewPhoto[];
}): Promise<PaymentAiReview> {
  const wbsLines = input.wbsBreakdown
    .map((w) => `- ${w.name}: bobot ${w.weightPct}%, progress naik dari ${w.lastPaidProgressPct}% ke ${w.progressPct}%`)
    .join("\n");

  const photoLines =
    input.photos.length > 0
      ? input.photos
          .map((p) => {
            const parts = [`${p.reportDate} (${p.employeeName})`];
            if (p.aiStage) parts.push(`tahap: ${p.aiStage}`);
            if (p.aiProgressPct !== null) parts.push(`estimasi progress foto: ${p.aiProgressPct}%`);
            if (p.aiNotes) parts.push(`catatan: ${p.aiNotes}`);
            if (p.aiConcerns) parts.push(`concern: ${p.aiConcerns}`);
            if (p.caption) parts.push(`keterangan pengawas: "${p.caption}"`);
            return `- ${parts.join(" | ")}`;
          })
          .join("\n")
      : "(tidak ada foto progres yang terkirim pada periode ini)";

  const userPrompt = `Proyek: ${input.projectName}
Kontraktor/tukang: ${input.contractorName}
Periode pembayaran: ${input.periodStart} s/d ${input.periodEnd}
Jumlah yang akan dibayar (gross earned): Rp${Math.round(input.grossEarned).toLocaleString("id-ID")}

Klaim progress WBS yang menjadi dasar perhitungan pembayaran ini:
${wbsLines || "(tidak ada rincian bobot)"}

Bukti foto progres lapangan pada periode ini (hasil penilaian visual per foto yang sudah ada sebelumnya):
${photoLines}

Nilai apakah klaim progress di atas WAJAR dibandingkan bukti foto yang ada. Pertimbangkan: apakah tahap/estimasi progress di foto konsisten dengan lompatan progress WBS yang diklaim, apakah jumlah foto memadai untuk periode ini, dan apakah ada concern yang tercatat di foto.

Hasilkan:
- verdict: salah satu dari "sesuai" (bukti foto mendukung klaim progress), "perlu_dicek" (bukti tidak cukup/ambigu, foto sedikit atau tidak ada, perlu verifikasi manual sebelum bayar), "tidak_sesuai" (bukti foto tampak bertentangan dengan klaim progress)
- summary: ringkasan 2-3 kalimat alasan penilaian
- concerns: daftar hal spesifik yang perlu diperhatikan Kepala Cabang/Finance sebelum approve (array kosong kalau tidak ada)

Balas HANYA dengan JSON object:
{"verdict": "sesuai", "summary": "...", "concerns": []}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 1024,
  });
  return parseReview(response.text);
}
