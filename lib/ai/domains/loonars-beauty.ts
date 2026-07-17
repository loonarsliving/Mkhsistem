import "server-only";

import { askAI } from "../service";
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
