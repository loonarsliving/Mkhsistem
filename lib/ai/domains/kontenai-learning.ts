import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah performance marketing analyst untuk MK Connect, menganalisis performa konten marketing bisnis leasehold properti, villa/occupancy, dan beauty untuk membantu tim membuat konten berikutnya lebih baik. Jawab selalu dalam Bahasa Indonesia. Balas HANYA dengan JSON object valid, tanpa markdown code fence, tanpa penjelasan tambahan di luar JSON.";

export interface ContentPerformanceMetrics {
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  ctr: number | null;
  leads: number | null;
}

export interface LearningInsightInput {
  platform: string;
  productProject: string;
  metrics: ContentPerformanceMetrics;
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
  sceneCount: number;
  totalDurationSeconds: number;
  assetSummary: string;
}

export interface LearningInsightResult {
  insight: string;
  recommendedHook: string;
  recommendedDurationSeconds: number;
  recommendedCta: string;
  recommendedVisual: string;
  recommendedTargetEmotion: string;
}

function asText(value: unknown, maxChars: number): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, maxChars) : "";
}

function asDuration(value: unknown, fallback: number): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
}

function parseLearningInsightJson(text: string, fallbackDuration: number): LearningInsightResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons Learning Engine bukan JSON yang valid");
  }

  const insight = asText(parsed.insight, 1000);
  const recommendedHook = asText(parsed.recommendedHook, 200);
  const recommendedCta = asText(parsed.recommendedCta, 200);
  const recommendedVisual = asText(parsed.recommendedVisual, 300);
  const recommendedTargetEmotion = asText(parsed.recommendedTargetEmotion, 100);

  if (!insight || !recommendedHook || !recommendedCta || !recommendedVisual || !recommendedTargetEmotion) {
    throw new Error("Respons Learning Engine tidak lengkap (ada field yang kosong)");
  }

  return {
    insight,
    recommendedHook,
    recommendedDurationSeconds: asDuration(parsed.recommendedDurationSeconds, fallbackDuration),
    recommendedCta,
    recommendedVisual,
    recommendedTargetEmotion,
  };
}

/**
 * "Buat AI Insight yang menjelaskan mengapa suatu konten berhasil atau
 * kurang berhasil" + "Berikan rekomendasi untuk konten berikutnya" --
 * reasons over the real logged metrics together with the exact Creative
 * Brief (AI Director) and storyboard/asset context that produced this
 * content, so the recommendation is grounded in what was actually tried,
 * not generic advice.
 */
export async function generateLearningInsight(input: LearningInsightInput): Promise<LearningInsightResult> {
  const m = input.metrics;
  const engagementLine = [
    `Views: ${m.views}`,
    `Reach: ${m.reach}`,
    `Likes: ${m.likes}`,
    `Comments: ${m.comments}`,
    `Shares: ${m.shares}`,
    `Saves: ${m.saves}`,
    m.ctr !== null ? `CTR: ${m.ctr}%` : null,
    m.leads !== null ? `Leads: ${m.leads}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const userPrompt = `Analisis performa konten "${input.productProject}" yang dipublikasikan di ${input.platform}.

Metrik performa: ${engagementLine}

Creative Brief (AI Director) yang mendasari konten ini:
- Big Idea: ${input.bigIdea}
- Hook: ${input.hook}
- Key Message: ${input.keyMessage}
- Target Emotion: ${input.targetEmotion}
- CTA: ${input.cta}
- Content Angle: ${input.contentAngle}

Storyboard: ${input.sceneCount} scene, total durasi ${input.totalDurationSeconds} detik.
Aset yang digunakan: ${input.assetSummary || "tidak ada data aset"}.

Berdasarkan data di atas, hasilkan:
- insight: penjelasan 2-4 kalimat MENGAPA konten ini berhasil atau kurang berhasil, kaitkan langsung dengan hook/CTA/durasi/aset/target emotion di atas, bukan komentar generik
- recommendedHook: saran hook konkret untuk konten berikutnya (kalimat pembuka)
- recommendedDurationSeconds: saran total durasi video berikutnya dalam detik (angka)
- recommendedCta: saran CTA konkret untuk konten berikutnya
- recommendedVisual: saran arahan visual/gaya shot untuk konten berikutnya
- recommendedTargetEmotion: saran target emotion untuk konten berikutnya

Balas HANYA dengan JSON object:
{"insight": "...", "recommendedHook": "...", "recommendedDurationSeconds": 30, "recommendedCta": "...", "recommendedVisual": "...", "recommendedTargetEmotion": "..."}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseFormat: "json",
    maxOutputTokens: 1024,
  });

  return parseLearningInsightJson(response.text, input.totalDurationSeconds || 30);
}
