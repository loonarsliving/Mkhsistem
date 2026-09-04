import "server-only";

import { askAI } from "@/lib/ai/service";

/**
 * Villa Revenue Engine "AI Insight" bridge (Phase 8 of villa's
 * revenue-engine program; see app/api/villa/ai/pricing-insight and
 * loonarsliving/villa's src/lib/aiBridge.ts).
 *
 * This is explicitly REASONING/EXPLANATION ONLY, never a decision. All
 * numbers (recommended rate, delta%, occupancy%, guardrail status) are
 * already computed deterministically by villa's own rule engine before
 * this is ever called -- the model is given those finished numbers and
 * asked only to phrase a short, plain-language explanation an admin can
 * read before clicking Approve/Reject. It cannot change the rate, cannot
 * decide whether to recommend a change, and its output is never
 * persisted as the recommendation itself (villa's approval endpoint
 * writes the numbers from the deterministic engine, not from this
 * text). Same guardrail discipline as FRIDAY's signals.ts: numbers are
 * computed in application code, never invented by the model.
 */

export interface VillaPricingInsightInput {
  room_type_name: string;
  target_date: string;
  current_rate: number;
  recommended_rate: number;
  delta_pct: number;
  reason_codes: string[];
  guardrail_status: string;
  occupancy_pct: number | null;
  pickup_bookings_3d: number | null;
  confidence: "low" | "medium" | "high";
}

const SYSTEM_PROMPT =
  "Kamu adalah asisten yang MENJELASKAN keputusan rekomendasi harga villa yang SUDAH dihitung oleh sistem rule-based -- kamu tidak membuat keputusan, tidak boleh mengubah angka, dan tidak boleh menyarankan angka lain. Tugasmu hanya menjelaskan dengan bahasa natural mengapa angka ini masuk akal (atau kapan perlu hati-hati), berdasarkan data yang diberikan. Jangan mengarang data yang tidak diberikan. Jawab singkat (maksimal 4 kalimat), dalam Bahasa Indonesia, nada membantu untuk admin/pemilik villa yang akan approve/reject.";

/**
 * One short-text Gemini call per recommendation, invoked on-demand from
 * villa's approval UI (never by the generation cron -- this is purely
 * for a human reading the recommendation, not stored as part of the
 * recommendation record).
 */
export async function explainPricingRecommendation(input: VillaPricingInsightInput): Promise<string> {
  const confidenceLabel = { low: "rendah (data booking masih sedikit)", medium: "sedang", high: "tinggi" }[input.confidence];
  const guardrailLabel =
    input.guardrail_status === "within_range"
      ? "tidak ada pembatasan tambahan"
      : `dibatasi oleh guardrail (${input.guardrail_status.replace("clamped_", "")})`;

  const userPrompt = `Data rekomendasi harga (SUDAH final, dihitung oleh rule engine -- kamu hanya menjelaskan, tidak mengubah):
- Tipe unit: ${input.room_type_name}
- Tanggal: ${input.target_date}
- Tarif saat ini: Rp ${Math.round(input.current_rate).toLocaleString("id-ID")}
- Tarif direkomendasikan: Rp ${Math.round(input.recommended_rate).toLocaleString("id-ID")} (${input.delta_pct > 0 ? "+" : ""}${Math.round(input.delta_pct * 1000) / 10}%)
- Alasan (kode sistem): ${input.reason_codes.join(", ") || "tidak ada"}
- Okupansi tanggal ini: ${input.occupancy_pct ?? "tidak diketahui"}%
- Booking baru 3 hari terakhir: ${input.pickup_bookings_3d ?? 0}
- Guardrail: ${guardrailLabel}
- Tingkat keyakinan sistem: ${confidenceLabel}

Jelaskan singkat kenapa rekomendasi ini masuk akal untuk admin yang akan approve/reject, dan sebutkan kalau tingkat keyakinannya rendah supaya admin tahu perlu dicek manual.`;

  const text = await askAI(SYSTEM_PROMPT, userPrompt, { maxOutputTokens: 300, temperature: 0.3 });
  return text.trim().slice(0, 800);
}
