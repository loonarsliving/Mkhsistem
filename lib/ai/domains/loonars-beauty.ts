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

export interface BeautyCompetitorComparisonPost {
  caption: string | null;
  mediaType: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  permalink: string | null;
}

export interface BeautyCompetitorComparisonInput {
  /** Recent posts on Loonars Beauty's own Zernio-connected account (see lib/social/zernio.ts's "beauty" product). */
  ourRecentPosts: BeautyCompetitorComparisonPost[];
  ourFollowersCount: number;
  competitorHandles: { platform: "instagram" | "tiktok"; handle: string }[];
  competitorNotes: string[];
}

export interface BeautyCompetitorComparisonResult {
  narrative: string;
  ourStrengths: string[];
  competitorStrengths: string[];
  gaps: string[];
  recommendations: string[];
}

function parseBeautyComparisonJson(text: string): BeautyCompetitorComparisonResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<BeautyCompetitorComparisonResult>;
  if (typeof parsed.narrative !== "string" || parsed.narrative.trim().length === 0) {
    throw new Error("AI beauty competitor comparison response missing narrative text");
  }
  const toList = (v: unknown, max: number) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim().slice(0, 300)).slice(0, max) : [];
  return {
    narrative: parsed.narrative.trim().slice(0, 2000),
    ourStrengths: toList(parsed.ourStrengths, 5),
    competitorStrengths: toList(parsed.competitorStrengths, 5),
    gaps: toList(parsed.gaps, 5),
    recommendations: toList(parsed.recommendations, 5),
  };
}

/**
 * Loonars Beauty's own version of compareLeaseholdCompetitorContent
 * (markom.ts, 0124) -- our real recent content (from Beauty's own Zernio
 * account, 0126) vs registered beauty competitors (social_competitor_
 * accounts, content_focus='beauty', 0125). Duplicated rather than shared
 * with the property version so this module's AI reasoning never touches
 * property data/prompts, matching this file's existing separation.
 */
export async function compareBeautyCompetitorContent(input: BeautyCompetitorComparisonInput): Promise<BeautyCompetitorComparisonResult> {
  if (input.competitorHandles.length === 0 && input.competitorNotes.length === 0) {
    throw new Error("No beauty competitors registered -- register or discover at least one before running a comparison");
  }

  const systemPrompt = await getSystemPrompt("loonars_beauty");
  const ourPostsBlock =
    input.ourRecentPosts.length > 0
      ? `Konten Loonars Beauty baru-baru ini (data nyata dari akun kami):\n${input.ourRecentPosts
          .map(
            (p, i) =>
              `${i + 1}. [${p.mediaType}] "${(p.caption ?? "(tanpa caption)").slice(0, 200)}" -- reach ${p.reach}, likes ${p.likes}, comments ${p.comments}, shares ${p.shares}, saves ${p.saves}${p.permalink ? `, url: ${p.permalink}` : ""}`,
          )
          .join("\n")}`
      : "Belum ada data post individual kami saat ini -- bandingkan berdasarkan followers dan data akun saja, sebutkan keterbatasan ini di narrative.";
  const competitorNotesBlock = input.competitorNotes.length > 0 ? `Observasi konten kompetitor yang dicatat tim secara manual (data nyata, prioritaskan ini):\n${input.competitorNotes.join("\n")}` : "";
  const handleList = input.competitorHandles.map((c) => `@${c.handle} (${c.platform})`).join(", ");

  const researchPrompt = `Kamu content strategist yang membandingkan akun media sosial HydraGlow Advanced Brightening Lotion (Loonars Beauty) dengan kompetitor skincare brightening yang terdaftar${handleList ? `: ${handleList}` : ""}. ${handleList ? "Riset lewat Google Search konten publik terbaru dari kompetitor-kompetitor itu (post yang bisa ditemukan lewat pencarian publik, TikTok tidak punya API publik jadi andalkan hasil ter-index Google)." : ""}

Followers kami saat ini: ${input.ourFollowersCount}.

${ourPostsBlock}

${competitorNotesBlock}

Bandingkan pola konkret (BUKAN cuma "siapa lebih banyak like"): gaya hook pembuka, format konten (UGC/testimoni vs edukasi vs before-after vs promosi langsung), pendekatan CTA, frekuensi/konsistensi posting, gaya hashtag & caption, dan klaim/positioning produk.

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{"narrative": "4-6 kalimat Bahasa Indonesia: pola utama yang membedakan kami vs kompetitor, dan kemungkinan dampaknya ke performa", "ourStrengths": ["1-5 hal konkret yang kami lakukan lebih baik"], "competitorStrengths": ["1-5 hal konkret yang kompetitor lakukan lebih baik"], "gaps": ["1-5 hal SPESIFIK yang kompetitor lakukan tapi kami belum -- ini akan langsung dipakai untuk brief ide konten berikutnya, jadi harus actionable, bukan generik"], "recommendations": ["1-5 rekomendasi konkret untuk konten minggu depan"]}`;

  try {
    const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: handleList.length > 0, maxOutputTokens: 2048 });
    return parseBeautyComparisonJson(response.text);
  } catch {
    // fall through to the unresearched fallback below
  }

  const fallbackPrompt = `${researchPrompt}\n\n(Jawab TANPA riset internet -- kalau tidak ada catatan manual kompetitor di atas, JANGAN mengarang postingan spesifik kompetitor; fokus narrative dan rekomendasi pada apa yang bisa dinilai dari data kami sendiri dan pengetahuan umum tentang pola konten skincare, sebutkan keterbatasan ini secara eksplisit di narrative.)`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1536 });
  return parseBeautyComparisonJson(fallbackResponse.text);
}

export interface BeautyContentPlannerContext {
  instagram?: { reach: number; profileViews: number; followersCount: number; bestHour: number | null; topContentType: string | null } | null;
  tiktok?: { videoViews: number; likes: number; followersCount: number } | null;
  competitorNotes?: string[];
  competitorHandles?: { platform: "instagram" | "tiktok"; handle: string }[];
  competitorComparison?: { gaps: string[]; recommendations: string[] } | null;
}

function buildBeautyContentPlannerContextBlock(context?: BeautyContentPlannerContext): string {
  const lines: string[] = [];
  if (context?.instagram) {
    const ig = context.instagram;
    lines.push(
      `Performa Instagram Loonars Beauty (data nyata): reach ${ig.reach}, profile views ${ig.profileViews}, followers ${ig.followersCount}` +
        (ig.bestHour !== null ? `, jam upload dengan reach terbaik: sekitar jam ${ig.bestHour}:00` : "") +
        (ig.topContentType ? `, jenis konten paling berhasil: ${ig.topContentType}` : "") +
        ".",
    );
  }
  if (context?.tiktok) {
    const tt = context.tiktok;
    const isColdStart = tt.followersCount < 1000;
    lines.push(
      `Performa TikTok Loonars Beauty (data nyata): ${tt.videoViews} video views, ${tt.likes} likes, ${tt.followersCount} followers.` +
        (isColdStart
          ? " Akun ini MASIH BARU/cold-start (di bawah 1000 followers) -- ide konten TikTok WAJIB fokus ke taktik growth/discovery (trend-jacking, hook FYP, frekuensi upload tinggi, hashtag discovery), BUKAN strategi mempertahankan audiens yang sudah ada."
          : ""),
    );
  }
  if (context?.competitorNotes?.length) {
    lines.push(`Observasi konten kompetitor yang dicatat tim secara manual (data nyata):\n${context.competitorNotes.join("\n")}`);
  }
  if (context?.competitorHandles?.length) {
    const handleList = context.competitorHandles.map((c) => `@${c.handle} (${c.platform})`).join(", ");
    lines.push(`Kompetitor yang perlu dicari aktivitas publiknya lewat Google Search: ${handleList}.`);
  }
  if (context?.competitorComparison?.gaps.length || context?.competitorComparison?.recommendations.length) {
    const cc = context.competitorComparison!;
    lines.push(
      `Hasil analisa perbandingan AI vs konten kompetitor minggu ini (WAJIB dipertimbangkan, bukan basa-basi):\n` +
        (cc.gaps.length ? `Kesenjangan (hal yang kompetitor lakukan tapi kami belum): ${cc.gaps.join("; ")}\n` : "") +
        (cc.recommendations.length ? `Rekomendasi dari analisa itu: ${cc.recommendations.join("; ")}` : ""),
    );
  }
  return lines.length > 0 ? `\n\nData performa & kompetitor kami saat ini:\n${lines.join("\n")}` : "";
}

export interface BeautyContentIdea {
  title: string;
  category: LoonarsContentCategory;
  platform: "instagram" | "tiktok";
  hook: string;
  caption: string;
  scriptNotes: string;
  cta: string;
}

function parseBeautyContentIdeasJson(text: string): BeautyContentIdea[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of content ideas");
  const validCategories = new Set<string>(["problem_solution", "ugc", "edukasi", "promosi"]);
  return parsed
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item?.title === "string" && typeof item?.category === "string" && validCategories.has(item.category) && (item?.platform === "instagram" || item?.platform === "tiktok"),
    )
    .map((item) => ({
      title: String(item.title).slice(0, 200),
      category: item.category as LoonarsContentCategory,
      platform: item.platform as "instagram" | "tiktok",
      hook: typeof item.hook === "string" ? item.hook.slice(0, 300) : "",
      caption: typeof item.caption === "string" ? item.caption.slice(0, 1000) : "",
      scriptNotes: typeof item.scriptNotes === "string" ? item.scriptNotes.slice(0, 1000) : "",
      cta: typeof item.cta === "string" ? item.cta.slice(0, 300) : "",
    }))
    .slice(0, 3);
}

/**
 * Loonars Beauty's equivalent of researchAndGenerateChecklist (markom.ts) --
 * real Zernio account performance + registered/discovered beauty
 * competitors + the latest AI competitor comparison (gaps/recommendations)
 * all feed into exactly 3 concrete content ideas, inserted directly into
 * loonars_content_items (status='idea') by the job processor. Closes the
 * same loop property has: competitor determination -> comparison ->
 * checklist, just for the beauty product line and its own Zernio account.
 */
export async function researchAndGenerateBeautyContentIdeas(context?: BeautyContentPlannerContext): Promise<BeautyContentIdea[]> {
  const systemPrompt = await getSystemPrompt("loonars_beauty");
  const contextBlock = buildBeautyContentPlannerContextBlock(context);

  const researchPrompt = `Riset dulu lewat Google Search: (1) tren skincare/brightening yang sedang viral di media sosial Indonesia saat ini, dan (2) aktivitas publik kompetitor yang terdaftar di bawah (jika ada).${contextBlock}

Gunakan riset dan data di atas sebagai dasar untuk membuat TEPAT 3 ide konten untuk HydraGlow Advanced Brightening Lotion (Loonars Beauty) untuk siklus kerja 3 hari ke depan -- harus konkret dan berdasar temuan riset/data nyata, bukan ide generik. Usahakan variasi kategori (problem_solution/ugc/edukasi/promosi) sesuai rasio target 40/30/20/10, bukan 3 ide dari kategori yang sama.

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa penjelasan tambahan) berisi tepat 3 object:
[{"title": "...", "category": "problem_solution atau ugc atau edukasi atau promosi", "platform": "instagram atau tiktok", "hook": "...", "caption": "...", "scriptNotes": "...", "cta": "..."}]

title: singkat (maks 80 karakter), nama tema kontennya.
hook: hook pembuka 3 detik pertama.
caption: draft caption lengkap.
scriptNotes: format konten, gaya editing/visual, beat/alur singkat.
cta: ajakan bertindak spesifik.`;

  try {
    const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: true, maxOutputTokens: 2560 });
    const items = parseBeautyContentIdeasJson(response.text);
    if (items.length > 0) return items.slice(0, 3);
  } catch {
    // fall through to the unresearched fallback below
  }

  const fallbackPrompt = `Buatkan TEPAT 3 ide konten untuk HydraGlow Advanced Brightening Lotion (Loonars Beauty) untuk siklus kerja 3 hari ke depan, tanpa riset internet, variasi kategori (problem_solution/ugc/edukasi/promosi).${contextBlock}

Balas HANYA dengan JSON array berisi tepat 3 object: [{"title": "...", "category": "...", "platform": "...", "hook": "...", "caption": "...", "scriptNotes": "...", "cta": "..."}]`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1536 });
  const fallbackItems = parseBeautyContentIdeasJson(fallbackResponse.text);
  if (fallbackItems.length === 0) throw new Error("AI did not return parseable content ideas");
  return fallbackItems.slice(0, 3);
}
