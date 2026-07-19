import "server-only";

import { askAI, generateAIText } from "../service";
import { getSystemPrompt } from "./prompts";

export type LoonarsContentCategory = "problem_solution" | "ugc" | "edukasi" | "promosi";

const CATEGORY_LABEL: Record<LoonarsContentCategory, string> = {
  problem_solution: "Problem-Solution (masalah kulit -> solusi produk)",
  ugc: "Testimoni/UGC (gaya user-generated content, autentik, bukan iklan formal)",
  edukasi: "Edukasi skincare (informatif, membangun trust, bukan jualan langsung)",
  promosi: "Promosi langsung (harga, diskon, urgensi, CTA beli)",
};

export async function generateLoonarsContentIdeas(category: LoonarsContentCategory, count = 3, context?: string): Promise<string> {
  const userPrompt = `Buatkan ${count} ide konten TikTok/Instagram untuk kategori "${CATEGORY_LABEL[category]}" untuk produk HydraGlow Advanced Brightening Lotion (Loonars Beauty).
Setiap ide harus punya: 1) Hook pembuka (3 detik pertama), 2) Alur/beat konten singkat (bukan naskah penuh), 3) Draft caption, 4) CTA.${
    context ? `\n\nKonteks tambahan:\n${context}` : ""
  }`;
  return askAI(await getSystemPrompt("loonars_beauty"), userPrompt);
}

export async function draftLoonarsFaqReply(question: string, productContext?: string): Promise<string> {
  const userPrompt = `Calon pembeli bertanya lewat WhatsApp/DM:\n"${question}"\n\nBalas dengan gaya closing yang ramah, singkat, dan meyakinkan (tanpa klaim medis/berlebihan).${
    productContext ? `\n\nInfo produk:\n${productContext}` : ""
  }`;
  return askAI(await getSystemPrompt("loonars_beauty"), userPrompt);
}

export interface LoonarsWeeklyEvaluationContext {
  weekStart: string;
  contentPublishedCount: number;
  ratioActual: Record<LoonarsContentCategory, number>;
  ratioTarget: Record<LoonarsContentCategory, number>;
  topPerformer: { title: string; views: number; linkClicks: number } | null;
  retargetingCandidates: { title: string; views: number }[];
  ordersThisWeek: number;
  ordersLastWeek: number;
}

/** Deterministic evaluation input built by the job processor from real DB data -- the AI only writes the narrative + recommendation, it never invents the numbers. */
export async function evaluateLoonarsWeeklyPerformance(ctx: LoonarsWeeklyEvaluationContext): Promise<string> {
  const ratioLines = (Object.keys(ctx.ratioTarget) as LoonarsContentCategory[])
    .map((key) => `- ${CATEGORY_LABEL[key]}: target ${ctx.ratioTarget[key]}%, aktual ${ctx.ratioActual[key] ?? 0}%`)
    .join("\n");

  const userPrompt = `Evaluasi performa konten Loonars Beauty minggu ${ctx.weekStart}.

Jumlah konten publish minggu ini: ${ctx.contentPublishedCount}
Rasio kategori konten (target vs aktual, dihitung dari 30 hari terakhir):
${ratioLines}

Konten performa terbaik minggu ini: ${
    ctx.topPerformer ? `"${ctx.topPerformer.title}" (${ctx.topPerformer.views} views, ${ctx.topPerformer.linkClicks} klik ke toko)` : "belum ada data performa yang diinput minggu ini"
  }

Kandidat retargeting (view >50% durasi tapi belum ada klik ke toko): ${
    ctx.retargetingCandidates.length > 0 ? ctx.retargetingCandidates.map((c) => `"${c.title}" (${c.views} views)`).join(", ") : "tidak ada"
  }

Order minggu ini: ${ctx.ordersThisWeek} | minggu lalu: ${ctx.ordersLastWeek}

Buat evaluasi singkat (maksimal 200 kata) mencakup: 1) apakah rasio konten sudah sesuai target dan apa yang perlu disesuaikan, 2) konten mana yang layak di-boost Spark Ads dan kenapa (kalau ada data), 3) apa yang harus diulang/diganti untuk 2-3 minggu ke depan, 4) saran retargeting kalau ada kandidat. Kalau data performa belum diinput minggu ini, katakan itu terus terang dan ingatkan tim untuk mulai mencatat.`;

  return askAI(await getSystemPrompt("loonars_beauty"), userPrompt, { maxOutputTokens: 700 });
}

export interface DiscoveredCompetitor {
  platform: "instagram" | "tiktok";
  handle: string;
  displayName: string | null;
  reason: string;
}

function parseDiscoveredCompetitorsJson(text: string): DiscoveredCompetitor[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of discovered competitors");
  return parsed
    .filter((item): item is { platform: string; handle: string; displayName?: unknown; reason?: unknown } => typeof item?.handle === "string" && (item?.platform === "instagram" || item?.platform === "tiktok"))
    .map((item) => ({
      platform: item.platform as "instagram" | "tiktok",
      handle: item.handle.replace(/^@/, "").trim().slice(0, 100),
      displayName: typeof item.displayName === "string" && item.displayName.trim().length > 0 ? item.displayName.trim().slice(0, 200) : null,
      reason: typeof item.reason === "string" ? item.reason.trim().slice(0, 500) : "",
    }))
    .filter((item) => item.handle.length > 0)
    .slice(0, 5);
}

/**
 * AI finds its own reference competitors for Loonars Beauty instead of
 * waiting on a human to register them (0125) -- same rationale/resilience
 * as discoverPropertyCompetitors (markom.ts), duplicated here rather than
 * imported so this file's AI reasoning stays fully self-contained and never
 * touches property-domain code, matching this module's existing strict
 * separation from the property knowledge bank/prompts.
 */
export async function discoverBeautyCompetitors(): Promise<DiscoveredCompetitor[]> {
  const systemPrompt = await getSystemPrompt("loonars_beauty");
  const researchPrompt = `Riset lewat Google Search: cari 3-5 akun Instagram/TikTok NYATA (bukan mengarang) brand skincare/body lotion brightening di Indonesia yang sepadan/bersaing dengan HydraGlow Advanced Brightening Lotion (Loonars Beauty) -- segmen harga menengah, dijual online (Shopee/TikTok Shop/WhatsApp), klaim mencerahkan kulit. Prioritaskan akun yang benar-benar aktif (ada postingan dalam beberapa bulan terakhir) dan relevan untuk dijadikan pembanding konten kami.

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa penjelasan tambahan) berisi maksimal 5 object:
[{"platform": "instagram atau tiktok", "handle": "username tanpa @", "displayName": "nama akun jika ada, atau null", "reason": "1 kalimat kenapa akun ini relevan jadi pembanding"}]

Jangan mengarang username -- kalau hasil pencarianmu tidak yakin akun itu benar-benar ada, jangan masukkan ke daftar.`;

  const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: true, maxOutputTokens: 1536 });
  return parseDiscoveredCompetitorsJson(response.text);
}
