import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah growth marketing strategist untuk MK Connect, mengoptimalkan strategi konten marketing bisnis leasehold properti, villa/occupancy, dan beauty berdasarkan data performa nyata. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

function asText(value: unknown, maxChars: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxChars) : "";
}

function asDuration(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
}

export interface OptimizationRecommendationInput {
  recordCount: number;
  topSummaries: string[];
  worstSummaries: string[];
  insightSamples: string[];
  bestPostingTime: string | null;
}

export interface OptimizationRecommendationResult {
  hook: string;
  caption: string;
  cta: string;
  durationSeconds: number;
  visualStyle: string;
  postingTime: string;
  rationale: string;
}

function parseOptimizationJson(text: string): OptimizationRecommendationResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI Recommendation bukan JSON yang valid");
  }

  const hook = asText(parsed.hook, 200);
  const caption = asText(parsed.caption, 400);
  const cta = asText(parsed.cta, 200);
  const visualStyle = asText(parsed.visualStyle, 300);
  const postingTime = asText(parsed.postingTime, 100);
  const rationale = asText(parsed.rationale, 1000);

  if (!hook || !caption || !cta || !visualStyle || !postingTime || !rationale) {
    throw new Error("Respons AI Recommendation tidak lengkap (ada field yang kosong)");
  }

  return { hook, caption, cta, durationSeconds: asDuration(parsed.durationSeconds, 30), visualStyle, postingTime, rationale };
}

/**
 * "Buat AI Recommendation berdasarkan Learning Engine" + the 6-item
 * optimization list (Hook, Caption, CTA, Durasi, Visual Style, Posting
 * Time) -- reasons over the accumulated Learning Engine history (Sprint
 * 8): what the top and worst performing content actually did, the AI
 * insights already recorded for them, and the real best-performing
 * posting hour computed from logged data.
 */
export async function generateOptimizationRecommendation(input: OptimizationRecommendationInput): Promise<OptimizationRecommendationResult> {
  const userPrompt = `Berdasarkan riwayat performa ${input.recordCount} konten yang sudah dipublikasikan, hasilkan rekomendasi optimasi untuk konten berikutnya.

Konten dengan performa TERBAIK:
${input.topSummaries.map((s) => `- ${s}`).join("\n") || "(tidak ada data)"}

Konten dengan performa TERBURUK:
${input.worstSummaries.map((s) => `- ${s}`).join("\n") || "(tidak ada data)"}

Sampel AI Insight dari Learning Engine:
${input.insightSamples.map((s) => `- ${s}`).join("\n") || "(tidak ada data)"}

${input.bestPostingTime ? `Data menunjukkan jam publish dengan engagement rate rata-rata tertinggi: ${input.bestPostingTime}.` : "Belum ada cukup data jam publish untuk dianalisis."}

Hasilkan rekomendasi optimasi konkret untuk konten berikutnya:
- hook: saran hook pembuka
- caption: saran gaya/struktur caption
- cta: saran CTA
- durationSeconds: saran durasi video (angka, detik)
- visualStyle: saran gaya visual/shot
- postingTime: saran jam/waktu publish terbaik (gunakan data jam publish di atas jika tersedia, atau estimasi masuk akal jika tidak)
- rationale: penjelasan 2-4 kalimat mengapa rekomendasi ini diberikan, kaitkan langsung dengan pola dari data terbaik/terburuk di atas

Balas HANYA dengan JSON object:
{"hook": "...", "caption": "...", "cta": "...", "durationSeconds": 30, "visualStyle": "...", "postingTime": "...", "rationale": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 1024,
  });

  return parseOptimizationJson(response.text);
}

export interface PeriodSummaryInput {
  period: "weekly" | "monthly";
  periodLabel: string;
  totalContent: number;
  publishedContent: number;
  totalViews: number;
  totalReach: number;
  engagementRate: number;
  avgCtr: number | null;
  totalLeads: number | null;
  conversionRate: number | null;
  topContentTitles: string[];
  worstContentTitles: string[];
}

function parseSummaryJson(text: string): string {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI Report bukan JSON yang valid");
  }
  const summary = asText(parsed.summary, 1500);
  if (!summary) throw new Error("Respons AI Report tidak menyertakan summary yang valid");
  return summary;
}

/** "Buat halaman AI Report yang merangkum performa mingguan dan bulanan" -- one narrative summary per period, grounded in the period's real KPI numbers. */
export async function generatePeriodSummary(input: PeriodSummaryInput): Promise<string> {
  const userPrompt = `Rangkum performa konten KontenAI periode ${input.period === "weekly" ? "mingguan" : "bulanan"} (${input.periodLabel}) berikut menjadi ringkasan naratif untuk manajemen.

KPI periode ini:
- Total Content: ${input.totalContent}
- Published Content: ${input.publishedContent}
- Total Views: ${input.totalViews}
- Total Reach: ${input.totalReach}
- Engagement Rate: ${input.engagementRate}%
- Rata-rata CTR: ${input.avgCtr !== null ? `${input.avgCtr}%` : "tidak tersedia"}
- Total Leads: ${input.totalLeads ?? "tidak tersedia"}
- Conversion Rate: ${input.conversionRate !== null ? `${input.conversionRate}%` : "tidak tersedia"}

Top performing content: ${input.topContentTitles.join(", ") || "tidak ada data"}
Worst performing content: ${input.worstContentTitles.join(", ") || "tidak ada data"}

Tulis summary 3-5 kalimat: performa keseluruhan periode ini, apa yang mendorong hasil terbaik, apa yang perlu diperbaiki, dan satu highlight actionable untuk periode berikutnya.

Balas HANYA dengan JSON object: {"summary": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 800,
  });

  return parseSummaryJson(response.text);
}
