import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membantu Kepala Cabang menilai kewajaran satu pengajuan pembayaran gaji tukang, sesaat setelah pengajuan itu diajukan, sebelum Kepala Cabang menyetujui lewat WhatsApp. Kamu hanya mensintesis bukti foto progres lapangan yang sudah ada penilaiannya, dan angka kontrak yang diajukan -- tetap konservatif kalau bukti pendukung tipis. Jawab selalu dalam Bahasa Indonesia, singkat (maksimal 2 kalimat). Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface TukangPaymentRecommendation {
  verdict: "wajar" | "perlu_dicek";
  note: string;
}

export interface TukangPaymentEvidencePhoto {
  reportDate: string;
  aiStage: string | null;
  aiProgressPct: number | null;
  aiNotes: string | null;
}

function parseRecommendation(text: string): TukangPaymentRecommendation {
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

  const verdict = typeof parsed.verdict === "string" && ["wajar", "perlu_dicek"].includes(parsed.verdict) ? (parsed.verdict as TukangPaymentRecommendation["verdict"]) : "perlu_dicek";

  return {
    verdict,
    note: typeof parsed.note === "string" ? parsed.note.trim().slice(0, 300) : "",
  };
}

/**
 * Fired from the WhatsApp relay (app/api/ai/whatsapp-relay/route.ts) right
 * before a "finance_expense_pending_verification" (tipe=tukang) message
 * goes out to the branch's Kepala Cabang -- appends a short AI note on top
 * of the deterministic sisa-kontrak figures already in the message,
 * cross-referencing recent daily photo-progress evidence for that branch
 * (the same already-assessed construction_progress_photos rows used by the
 * cm_labor_payments AI review). No image call here -- the per-photo visual
 * assessment already happened when the photo was sent.
 */
export async function recommendTukangPayment(input: {
  tukangNama: string;
  nominalDiajukan: number;
  terbayarSetelahIni: number;
  sisaKontrakSetelahIni: number;
  photos: TukangPaymentEvidencePhoto[];
}): Promise<TukangPaymentRecommendation> {
  const nilaiKontrak = input.terbayarSetelahIni + input.sisaKontrakSetelahIni;

  const photoLines =
    input.photos.length > 0
      ? input.photos
          .map((p) => {
            const parts = [p.reportDate];
            if (p.aiStage) parts.push(`tahap: ${p.aiStage}`);
            if (p.aiProgressPct !== null) parts.push(`estimasi progress: ${p.aiProgressPct}%`);
            if (p.aiNotes) parts.push(`catatan: ${p.aiNotes}`);
            return `- ${parts.join(" | ")}`;
          })
          .join("\n")
      : "(tidak ada foto progres lapangan pada 14 hari terakhir)";

  const userPrompt = `Tukang: ${input.tukangNama}
Nilai kontrak (perkiraan dari total terbayar + sisa): Rp${Math.round(nilaiKontrak).toLocaleString("id-ID")}
Nominal yang diajukan sekarang: Rp${Math.round(input.nominalDiajukan).toLocaleString("id-ID")}
Total terbayar setelah pengajuan ini: Rp${Math.round(input.terbayarSetelahIni).toLocaleString("id-ID")}
Sisa kontrak setelah pengajuan ini: Rp${Math.round(input.sisaKontrakSetelahIni).toLocaleString("id-ID")}

Bukti foto progres lapangan cabang ini, 14 hari terakhir:
${photoLines}

Nilai apakah nominal yang diajukan tampak wajar dibandingkan bukti foto progres yang ada dan sisa kontrak. Berikan catatan singkat (maksimal 2 kalimat) yang bisa langsung dibaca Kepala Cabang di WhatsApp sebelum menyetujui.

Hasilkan:
- verdict: "wajar" (bukti mendukung, atau tidak ada alasan untuk curiga) atau "perlu_dicek" (bukti foto sedikit/tidak ada, atau progres yang terlihat tidak sebanding dengan nominal)
- note: catatan singkat 1-2 kalimat

Balas HANYA dengan JSON object:
{"verdict": "wajar", "note": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 400,
  });
  return parseRecommendation(response.text);
}
