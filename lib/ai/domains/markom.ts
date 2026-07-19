import "server-only";

import { askAI, generateAIText } from "../service";
import { getSystemPrompt } from "./prompts";

export async function askMarkomAi(question: string, context?: string): Promise<string> {
  const userPrompt = context ? `Konteks:\n${context}\n\nPertanyaan:\n${question}` : question;
  return askAI(await getSystemPrompt("markom"), userPrompt);
}

export async function generateMarketingChecklist(topic: string, context?: string): Promise<string> {
  const userPrompt = `Buatkan checklist marketing untuk: "${topic}".${
    context ? `\n\nKonteks:\n${context}` : ""
  }\nFormat: daftar checklist bernomor yang bisa langsung dieksekusi tim Markom.`;
  return askAI(await getSystemPrompt("markom"), userPrompt);
}

export async function findCampaignReference(productType: string): Promise<string> {
  const userPrompt = `Berikan 3-5 referensi ide campaign marketing yang relevan untuk produk properti bertipe "${productType}" di Indonesia. Sertakan judul campaign, channel yang cocok (Instagram/TikTok/Facebook Ads/Walk-in), dan alasan singkat mengapa relevan.`;
  return askAI(await getSystemPrompt("markom"), userPrompt);
}

export async function generateContentIdeas(theme: string, count = 5): Promise<string> {
  const userPrompt = `Berikan ${count} ide konten (caption + format visual singkat) dengan tema "${theme}" untuk media sosial perusahaan properti.`;
  return askAI(await getSystemPrompt("markom"), userPrompt);
}

export async function generateWeeklyMarkomChecklist(branchName: string, context?: string): Promise<string> {
  const userPrompt = `Buatkan weekly checklist tim Markom cabang "${branchName}" untuk minggu ini.${
    context ? `\n\nKonteks progres minggu lalu:\n${context}` : ""
  }\nFormat: checklist bernomor per hari kerja (Senin-Jumat), realistis untuk tim kecil.`;
  return askAI(await getSystemPrompt("markom"), userPrompt);
}

export async function generateMarketingEvaluation(summary: string): Promise<string> {
  const userPrompt = `Berdasarkan ringkasan aktivitas marketing berikut, buatkan evaluasi:\n${summary}\n\nFormat: (1) pencapaian, (2) kekurangan, (3) rekomendasi perbaikan minggu/bulan depan.`;
  return askAI(await getSystemPrompt("markom"), userPrompt);
}

export interface MarkomChecklistItem {
  title: string;
  description: string;
}

interface RawChecklistItem {
  title: string;
  description: string;
  platform?: string;
  platformReason?: string;
}

/** Prepends the platform (Instagram/TikTok) + why, so it's the first thing Markom reads -- title stays a plain 80-char content-theme label, kpi_tasks has no dedicated platform column so this is folded into description rather than a schema change. */
function formatChecklistDescription(item: RawChecklistItem): string {
  const platform = item.platform?.toLowerCase().includes("tiktok") ? "TikTok" : item.platform?.toLowerCase().includes("instagram") ? "Instagram" : null;
  const platformLine = platform
    ? `Platform: ${platform}${item.platformReason ? ` -- ${item.platformReason}` : ""}\n\n`
    : "";
  return `${platformLine}${item.description}`.slice(0, 1000);
}

function parseChecklistJson(text: string): MarkomChecklistItem[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of checklist items");
  return parsed
    .filter((item): item is RawChecklistItem => typeof item?.title === "string" && typeof item?.description === "string")
    .map((item) => ({ title: item.title.slice(0, 200), description: formatChecklistDescription(item) }));
}

export interface ContentPlannerContext {
  instagram?: { reach: number; profileViews: number; followersCount: number; bestHour: number | null; topContentType: string | null } | null;
  tiktok?: { videoViews: number; likes: number; followersCount: number } | null;
  /** Formatted one-liners from social_competitor_content_logs -- real human-observed competitor posts, since no API exposes competitor engagement data on either platform. */
  competitorNotes?: string[];
  /** Registered competitors (social_competitor_accounts) with no manual log yet, or that should be re-checked -- AI searches for their public activity itself instead of waiting on a manual log to exist. TikTok's official API is effectively unobtainable for a business this size, so "TikTok data" here always means Google-searched public information, never a direct API pull. */
  competitorHandles?: { platform: "instagram" | "tiktok"; handle: string }[];
  /** Latest leasehold-vs-competitor comparison (0124) -- leasehold_sales-only, never surfaced for occupancy/beauty checklists (different competitors, different angle). See compareLeaseholdCompetitorContent below. */
  competitorComparison?: { gaps: string[]; recommendations: string[] } | null;
}

function buildContentPlannerContextBlock(context: ContentPlannerContext | undefined, focus: ChecklistContentFocus): string {
  const lines: string[] = [];
  if (context?.instagram) {
    const ig = context.instagram;
    lines.push(
      `Performa Instagram kami (data nyata dari Meta API): reach ${ig.reach}, profile views ${ig.profileViews}, followers ${ig.followersCount}` +
        (ig.bestHour !== null ? `, jam upload dengan reach terbaik: sekitar jam ${ig.bestHour}:00` : "") +
        (ig.topContentType ? `, jenis konten paling berhasil: ${ig.topContentType}` : "") +
        ".",
    );
  }
  if (context?.tiktok) {
    const tt = context.tiktok;
    const isColdStart = tt.followersCount < 1000;
    lines.push(
      `Performa TikTok kami (data nyata): ${tt.videoViews} video views, ${tt.likes} likes, ${tt.followersCount} followers.` +
        (isColdStart
          ? " Akun ini MASIH BARU/cold-start (di bawah 1000 followers) -- checklist untuk TikTok WAJIB fokus ke taktik growth/discovery (trend-jacking, hook FYP, frekuensi upload tinggi, hashtag discovery), BUKAN strategi mempertahankan audiens yang sudah ada."
          : ""),
    );
  }
  if (context?.competitorNotes?.length) {
    lines.push(`Observasi konten kompetitor yang dicatat tim Markom secara manual (data nyata):\n${context.competitorNotes.join("\n")}`);
  }
  if (context?.competitorHandles?.length) {
    const handleList = context.competitorHandles.map((c) => `@${c.handle} (${c.platform})`).join(", ");
    lines.push(
      `Kompetitor yang perlu dicari aktivitas publiknya lewat Google Search (TikTok tidak punya API publik yang bisa kami akses, jadi cari info publik yang ter-index Google -- video/postingan yang sedang ramai, hashtag yang dipakai, gaya konten): ${handleList}.`,
    );
  }
  // leasehold_sales only -- occupancy/beauty compete against a different set of accounts entirely, this analysis would mislead them.
  if (focus === "leasehold_sales" && (context?.competitorComparison?.gaps.length || context?.competitorComparison?.recommendations.length)) {
    const cc = context.competitorComparison!;
    lines.push(
      `Hasil analisa perbandingan AI vs konten kompetitor leasehold minggu ini (WAJIB dipertimbangkan, bukan basa-basi):\n` +
        (cc.gaps.length ? `Kesenjangan (hal yang kompetitor lakukan tapi kami belum): ${cc.gaps.join("; ")}\n` : "") +
        (cc.recommendations.length ? `Rekomendasi dari analisa itu: ${cc.recommendations.join("; ")}` : ""),
    );
  }
  return lines.length > 0 ? `\n\nData performa & kompetitor kami saat ini:\n${lines.join("\n")}` : "";
}

/**
 * Researches current viral social-media trends and competitor property/villa
 * content via Gemini's Google Search grounding (useWebSearch) -- the only
 * "TikTok trend/competitor data" source this module has, since TikTok's
 * official API is effectively unobtainable for a business this size (the
 * user confirmed this directly). Own-account performance comes from the
 * real Meta/Instagram Graph API instead (Meta already connected). Turns
 * all of that into exactly 3 Markom checklist items -- the basis for
 * markom_run_ai_checklist's cron (see migration 0070) and the Content
 * Planner module (0085). Falls back to a plain unresearched checklist
 * prompt if grounded generation fails to parse, rather than losing the
 * whole cycle over one bad response.
 */
export type ChecklistContentFocus = "leasehold_sales" | "occupancy";

/**
 * "leasehold_sales" (default) targets investors -- the sales/investment
 * pitch for the leasehold itself. "occupancy" targets travelers/renters --
 * showcasing the villa as a place to actually stay (tour, amenities,
 * guest experience, local attractions, booking CTA), completely different
 * audience and angle even though it's the same property. Owner's explicit
 * instruction: never blend the two into one checklist, since the
 * viewer/goal is different (buy an investment vs. book a stay).
 */
function focusResearchTopic(focus: ChecklistContentFocus): string {
  return focus === "occupancy"
    ? 'konten yang menonjolkan pengalaman MENGINAP di villa (tur properti, fasilitas, suasana, aktivitas lokal sekitar, testimoni tamu) untuk menarik calon PENYEWA/wisatawan agar booking -- BUKAN konten jual-beli leasehold, jangan sebut skema investasi/ROI/harga jual sama sekali di sini'
    : "konten penjualan villa leasehold untuk calon INVESTOR (nilai investasi, ROI/yield, legalitas leasehold, urgensi unit terbatas)";
}

export async function researchAndGenerateChecklist(
  branchName: string,
  context?: ContentPlannerContext,
  focus: ChecklistContentFocus = "leasehold_sales",
): Promise<MarkomChecklistItem[]> {
  const systemPrompt = await getSystemPrompt("markom");
  const contextBlock = buildContentPlannerContextBlock(context, focus);
  const topic = focusResearchTopic(focus);
  const researchPrompt = `Riset dulu lewat Google Search: (1) hal-hal yang sedang viral/tren saat ini di media sosial Indonesia (khususnya TikTok dan Instagram, cari data publik yang ter-index Google karena tidak ada akses API resmi TikTok) yang cocok dijadikan ${topic}, dan (2) aktivitas publik kompetitor yang terdaftar di bawah (jika ada) -- cari konten/postingan terbaru mereka yang bisa ditemukan lewat pencarian publik.${contextBlock}

Gunakan riset dan data di atas sebagai dasar untuk membuat TEPAT 3 checklist konten untuk tim Markom cabang "${branchName}" pada siklus kerja 3 hari ke depan -- task harus konkret dan berdasar temuan riset/data nyata, bukan ide generik.

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa penjelasan tambahan) berisi tepat 3 object:
[{"title": "...", "description": "...", "platform": "Instagram atau TikTok", "platformReason": "..."}]

title: singkat (maks 80 karakter), actionable -- nama tema kontennya.
description: WAJIB mencakup secara eksplisit dan terstruktur: format konten (reel/video/foto/carousel), hook pembuka, durasi ideal, gaya editing, draft caption singkat, CTA, hashtag yang disarankan, dan jam upload terbaik (pakai data performa kami di atas jika tersedia). Sebutkan tren/kompetitor/data spesifik yang mendasari pilihan ini.
platform: WAJIB pilih salah satu, "Instagram" atau "TikTok" -- platform mana yang paling cocok untuk konten spesifik ini (boleh beda-beda per checklist, tidak harus semua platform yang sama).
platformReason: 1 kalimat, jelaskan ke tim Markom kenapa platform itu yang paling pas untuk konten ini (mis. gaya audiens, format yang lebih works di platform itu, atau data performa kami di platform itu).`;

  try {
    const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: true, maxOutputTokens: 2560 });
    const items = parseChecklistJson(response.text);
    if (items.length > 0) return items.slice(0, 3);
  } catch {
    // fall through to the unresearched fallback below
  }

  const fallbackPrompt = `Buatkan TEPAT 3 checklist konten untuk tim Markom cabang "${branchName}" pada siklus kerja 3 hari ke depan, seputar ${topic}, tanpa riset internet.${contextBlock}

description WAJIB mencakup: format konten, hook pembuka, durasi ideal, gaya editing, draft caption, CTA, hashtag, dan jam upload terbaik.
platform: WAJIB pilih "Instagram" atau "TikTok" per checklist, boleh beda-beda.
platformReason: 1 kalimat kenapa platform itu yang dipilih.

Balas HANYA dengan JSON array berisi tepat 3 object: [{"title": "...", "description": "...", "platform": "...", "platformReason": "..."}]`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1536 });
  const fallbackItems = parseChecklistJson(fallbackResponse.text);
  if (fallbackItems.length === 0) throw new Error("AI did not return a parseable checklist");
  return fallbackItems.slice(0, 3);
}

export interface WeeklyContentAuditPost {
  permalink: string | null;
  caption: string | null;
  mediaType: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export interface WeeklyContentAuditInput {
  instagramThisWeek?: { reach: number; profileViews: number; followersCount: number } | null;
  instagramLastWeek?: { reach: number; profileViews: number; followersCount: number } | null;
  /** Real recent posts (lib/social/instagram.ts's getRecentInstagramMediaPerformance) -- lets the audit score actual hook/value/CTA/niche-fit/engagement per post instead of only account-level aggregates. */
  instagramTopPosts?: WeeklyContentAuditPost[];
  tiktokThisWeek?: { videoViews: number; likes: number; followersCount: number } | null;
  competitorNotes: string[];
}

export interface WeeklyContentAuditScores {
  hook: number;
  value: number;
  cta: number;
  nicheFit: number;
  engagementPotential: number;
  platformOptimization: number;
  overall: number;
}

export interface WeeklyContentAuditHighlight {
  permalink: string | null;
  reasoning: string;
}

export type WeeklyContentGrowthSignal = "excellent" | "on_track" | "below_benchmark";

export interface WeeklyContentAuditResult {
  narrative: string;
  scores: WeeklyContentAuditScores;
  growthSignal: WeeklyContentGrowthSignal;
  bestPost: WeeklyContentAuditHighlight | null;
  worstPost: WeeklyContentAuditHighlight | null;
  recommendations: string[];
}

function clampScore(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n * 10) / 10));
}

function parseWeeklyContentAuditJson(text: string): WeeklyContentAuditResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Omit<Partial<WeeklyContentAuditResult>, "scores"> & { scores?: Partial<WeeklyContentAuditScores> };

  if (typeof parsed.narrative !== "string" || parsed.narrative.trim().length === 0) {
    throw new Error("AI weekly content audit response missing narrative text");
  }
  const rawScores = parsed.scores ?? {};
  const scores: WeeklyContentAuditScores = {
    hook: clampScore(rawScores.hook),
    value: clampScore(rawScores.value),
    cta: clampScore(rawScores.cta),
    nicheFit: clampScore(rawScores.nicheFit),
    engagementPotential: clampScore(rawScores.engagementPotential),
    platformOptimization: clampScore(rawScores.platformOptimization),
    overall: 5,
  };
  scores.overall = Math.round(((scores.hook + scores.value + scores.cta + scores.nicheFit + scores.engagementPotential + scores.platformOptimization) / 6) * 10) / 10;

  const growthSignal: WeeklyContentGrowthSignal =
    parsed.growthSignal === "excellent" || parsed.growthSignal === "below_benchmark" ? parsed.growthSignal : "on_track";

  return {
    narrative: parsed.narrative.trim().slice(0, 2000),
    scores,
    growthSignal,
    bestPost:
      parsed.bestPost && typeof parsed.bestPost.reasoning === "string"
        ? { permalink: typeof parsed.bestPost.permalink === "string" ? parsed.bestPost.permalink : null, reasoning: parsed.bestPost.reasoning.slice(0, 500) }
        : null,
    worstPost:
      parsed.worstPost && typeof parsed.worstPost.reasoning === "string"
        ? { permalink: typeof parsed.worstPost.permalink === "string" ? parsed.worstPost.permalink : null, reasoning: parsed.worstPost.reasoning.slice(0, 500) }
        : null,
    recommendations: Array.isArray(parsed.recommendations)
      ? parsed.recommendations.filter((r): r is string => typeof r === "string" && r.trim().length > 0).map((r) => r.trim().slice(0, 300)).slice(0, 5)
      : [],
  };
}

/**
 * Weekly Content Audit -- scores real posted content against the same
 * hook/value/CTA/niche-fit/engagement-potential/platform-optimization
 * rubric a content-audit agency would use (each 1-10, overall = average),
 * flags the week's strongest and weakest real post with concrete reasoning
 * (never "content bagus" without a number attached), and reads growth
 * against Instagram's own algorithm signal hierarchy (saves > shares >
 * completion > comments > likes) rather than raw follower count alone.
 * Falls back to account-level-only scoring when instagramTopPosts is empty
 * (e.g. Instagram token temporarily can't list media) -- narrower input,
 * same rubric, no crash.
 */
export async function auditWeeklyContentPerformance(input: WeeklyContentAuditInput): Promise<WeeklyContentAuditResult> {
  const igLine = input.instagramThisWeek
    ? `Instagram minggu ini: reach ${input.instagramThisWeek.reach}, profile views ${input.instagramThisWeek.profileViews}, followers ${input.instagramThisWeek.followersCount}.` +
      (input.instagramLastWeek ? ` Minggu lalu: reach ${input.instagramLastWeek.reach}, profile views ${input.instagramLastWeek.profileViews}.` : "")
    : "Data akun Instagram tidak tersedia.";
  const ttLine = input.tiktokThisWeek
    ? `TikTok minggu ini: ${input.tiktokThisWeek.videoViews} video views, ${input.tiktokThisWeek.likes} likes, ${input.tiktokThisWeek.followersCount} followers.`
    : "TikTok belum terhubung ke sistem -- audit minggu ini hanya mencakup Instagram.";
  const competitorBlock = input.competitorNotes.length > 0 ? `Observasi konten kompetitor minggu ini:\n${input.competitorNotes.join("\n")}` : "Tidak ada catatan kompetitor minggu ini.";
  const postsBlock =
    input.instagramTopPosts && input.instagramTopPosts.length > 0
      ? `Post Instagram nyata minggu ini (data asli dari Instagram Graph API, nilai satu per satu -- JANGAN menilai rata-rata saja):\n${input.instagramTopPosts
          .map(
            (p, i) =>
              `${i + 1}. [${p.mediaType}] "${(p.caption ?? "(tanpa caption)").slice(0, 200)}" -- reach ${p.reach}, likes ${p.likes}, comments ${p.comments}, shares ${p.shares}, saves ${p.saves}${p.permalink ? `, url: ${p.permalink}` : ""}`,
          )
          .join("\n")}`
      : "Tidak ada data post individual minggu ini (mungkin belum ada post baru, atau API sedang bermasalah) -- audit skor di bawah berdasarkan data akun secara umum saja, sebutkan keterbatasan ini di narrative.";

  const userPrompt = `Audit performa konten media sosial perusahaan minggu ini, sebagai content auditor yang objektif (skor jujur, bukan basa-basi).

${igLine}
${ttLine}

${postsBlock}

${competitorBlock}

Tugas kamu:
1. Beri skor 1-10 (boleh desimal) untuk 6 dimensi berikut, berdasarkan pola dari post-post nyata di atas (kalau tidak ada data post, nilai berdasarkan data akun + observasi kompetitor, dan jelaskan keterbatasan ini di narrative): hook (apakah 3 kata/detik pertama menghentikan scroll?), value (insight/informasi konkret, bukan tips umum?), cta (ajakan bertindak spesifik, bukan generik "like & follow"?), nicheFit (relevan & terasa khusus untuk audiens target?), engagementPotential (ada alasan orang mau save/share/comment bermakna?), platformOptimization (format, panjang caption, hashtag sesuai platform?).
2. Tentukan growthSignal: "excellent" (reach/followers naik jelas dibanding minggu lalu, tidak ada tanda stagnan), "on_track" (stabil/naik tipis, tidak ada masalah mendesak), atau "below_benchmark" (reach/followers turun atau stagnan berkepanjangan).
3. Identifikasi SATU post terbaik dan SATU post terlemah minggu ini dari data di atas (permalink + alasan konkret merujuk ke isi post-nya, bukan cuma angka) -- null kalau tidak ada data post untuk dibandingkan.
4. Tulis narrative (4-6 kalimat Bahasa Indonesia): apa yang berhasil dan kemungkinan sebabnya, apa yang kurang berhasil dan kemungkinan sebabnya, perubahan strategi kompetitor yang terlihat (jika ada catatan).
5. Berikan 2-4 rekomendasi konkret dan actionable untuk minggu depan (bukan saran generik "posting lebih sering").

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{"narrative": "...", "scores": {"hook": angka, "value": angka, "cta": angka, "nicheFit": angka, "engagementPotential": angka, "platformOptimization": angka}, "growthSignal": "excellent atau on_track atau below_benchmark", "bestPost": {"permalink": "url atau null", "reasoning": "..."} atau null, "worstPost": {"permalink": "url atau null", "reasoning": "..."} atau null, "recommendations": ["...", "..."]}`;

  const response = await generateAIText({ systemPrompt: await getSystemPrompt("markom"), userPrompt, maxOutputTokens: 2048 });
  return parseWeeklyContentAuditJson(response.text);
}

export interface CompetitorComparisonPost {
  caption: string | null;
  mediaType: string;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  permalink: string | null;
}

export interface CompetitorComparisonInput {
  /** Recent posts on our own account (Zernio or Meta Graph API, see getRecentZernioMediaPerformance/getRecentInstagramMediaPerformance) -- this is the account's whole recent output, not filtered to leasehold-only, since neither platform lets us tag a post by content_focus after the fact. The prompt is told this explicitly so it reasons about relevance itself instead of assuming every post is a leasehold pitch. */
  ourRecentPosts: CompetitorComparisonPost[];
  ourFollowersCount: number;
  /** Registered leasehold competitors (social_competitor_accounts) -- researched live via Google Search grounding, since neither platform exposes another account's engagement data through any API. */
  competitorHandles: { platform: "instagram" | "tiktok"; handle: string }[];
  /** Real human-observed competitor posts (social_competitor_content_logs), if any exist -- takes precedence over what AI finds via search. */
  competitorNotes: string[];
}

export interface LeaseholdCompetitorComparisonResult {
  narrative: string;
  ourStrengths: string[];
  competitorStrengths: string[];
  /** Things competitors do that we currently don't -- this is what actually drives the next checklist (buildContentPlannerContextBlock). */
  gaps: string[];
  recommendations: string[];
}

function parseCompetitorComparisonJson(text: string): LeaseholdCompetitorComparisonResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<LeaseholdCompetitorComparisonResult>;
  if (typeof parsed.narrative !== "string" || parsed.narrative.trim().length === 0) {
    throw new Error("AI competitor comparison response missing narrative text");
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
 * Phase 2 of the Content Planner roadmap: puts our own real recent
 * leasehold-account content side by side with what registered leasehold
 * competitors are actually posting, and asks the AI to reason like a
 * competitive content strategist -- not just "who has more likes" but
 * concrete pattern differences (hook style, content format mix, CTA
 * approach, posting cadence, hashtag/caption style) that explain why. The
 * gaps + recommendations this produces flow straight into the next
 * leasehold_sales checklist (ContentPlannerContext.competitorComparison,
 * buildContentPlannerContextBlock above) so checklist generation is
 * actually informed by competitive analysis, not just generic trend
 * research. Falls back to an ungrounded prompt (leaning on any real manual
 * logs, explicit about not inventing specific competitor posts it can't
 * verify) if grounded generation fails to parse, same resilience pattern as
 * researchAndGenerateChecklist.
 */
export async function compareLeaseholdCompetitorContent(input: CompetitorComparisonInput): Promise<LeaseholdCompetitorComparisonResult> {
  if (input.competitorHandles.length === 0 && input.competitorNotes.length === 0) {
    throw new Error("No leasehold competitors registered -- register at least one in Content Planner before running a comparison");
  }

  const systemPrompt = await getSystemPrompt("markom");
  const ourPostsBlock =
    input.ourRecentPosts.length > 0
      ? `Konten kami baru-baru ini (data nyata dari akun kami -- CATATAN: ini seluruh output akun, bukan hanya konten leasehold, nilai relevansinya sendiri):\n${input.ourRecentPosts
          .map(
            (p, i) =>
              `${i + 1}. [${p.mediaType}] "${(p.caption ?? "(tanpa caption)").slice(0, 200)}" -- reach ${p.reach}, likes ${p.likes}, comments ${p.comments}, shares ${p.shares}, saves ${p.saves}${p.permalink ? `, url: ${p.permalink}` : ""}`,
          )
          .join("\n")}`
      : "Belum ada data post individual kami saat ini -- bandingkan berdasarkan followers dan data akun saja, sebutkan keterbatasan ini di narrative.";
  const competitorNotesBlock = input.competitorNotes.length > 0 ? `Observasi konten kompetitor yang dicatat tim Markom secara manual (data nyata, prioritaskan ini):\n${input.competitorNotes.join("\n")}` : "";
  const handleList = input.competitorHandles.map((c) => `@${c.handle} (${c.platform})`).join(", ");

  const researchPrompt = `Kamu content strategist yang membandingkan akun media sosial leasehold villa/properti kami dengan kompetitor leasehold yang terdaftar${handleList ? `: ${handleList}` : ""}. ${handleList ? "Riset lewat Google Search konten publik terbaru dari kompetitor-kompetitor itu (post yang bisa ditemukan lewat pencarian publik, TikTok tidak punya API publik jadi andalkan hasil ter-index Google)." : ""}

Followers kami saat ini: ${input.ourFollowersCount}.

${ourPostsBlock}

${competitorNotesBlock}

Bandingkan pola konkret (BUKAN cuma "siapa lebih banyak like"): gaya hook pembuka, format konten (reel/carousel/story dominan yang mana), pendekatan CTA, frekuensi/konsistensi posting, gaya hashtag & caption, dan sudut pandang pitch (investasi/ROI vs gaya hidup vs urgensi).

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{"narrative": "4-6 kalimat Bahasa Indonesia: pola utama yang membedakan kami vs kompetitor, dan kemungkinan dampaknya ke performa", "ourStrengths": ["1-5 hal konkret yang kami lakukan lebih baik"], "competitorStrengths": ["1-5 hal konkret yang kompetitor lakukan lebih baik"], "gaps": ["1-5 hal SPESIFIK yang kompetitor lakukan tapi kami belum -- ini akan langsung dipakai untuk brief checklist konten berikutnya, jadi harus actionable, bukan generik"], "recommendations": ["1-5 rekomendasi konkret untuk checklist konten leasehold minggu depan"]}`;

  try {
    const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: handleList.length > 0, maxOutputTokens: 2048 });
    return parseCompetitorComparisonJson(response.text);
  } catch {
    // fall through to the unresearched fallback below
  }

  const fallbackPrompt = `${researchPrompt}\n\n(Jawab TANPA riset internet -- kalau tidak ada catatan manual kompetitor di atas, JANGAN mengarang postingan spesifik kompetitor; fokus narrative dan rekomendasi pada apa yang bisa dinilai dari data kami sendiri dan pengetahuan umum tentang pola konten leasehold/properti, sebutkan keterbatasan ini secara eksplisit di narrative.)`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1536 });
  return parseCompetitorComparisonJson(fallbackResponse.text);
}

export interface MarkomObstacleInput {
  taskTitle: string;
  taskDescription: string | null;
  /** Markom's own free-text explanation of what's blocking them from completing the brief as given. */
  obstacleResponse: string;
}

export interface MarkomObstacleResolution {
  action: "revise_brief" | "give_guidance";
  /** Always populated -- the message shown to Markom regardless of which action was taken. */
  guidance: string;
  /** Only set when action is "revise_brief". */
  newTitle?: string;
  newDescription?: string;
}

function parseObstacleResolutionJson(text: string): MarkomObstacleResolution {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<MarkomObstacleResolution>;
  if (parsed.action !== "revise_brief" && parsed.action !== "give_guidance") {
    throw new Error("AI obstacle response missing a valid action");
  }
  if (typeof parsed.guidance !== "string" || parsed.guidance.trim().length === 0) {
    throw new Error("AI obstacle response missing guidance text");
  }
  return {
    action: parsed.action,
    guidance: parsed.guidance.slice(0, 1500),
    newTitle: parsed.action === "revise_brief" && typeof parsed.newTitle === "string" ? parsed.newTitle.slice(0, 200) : undefined,
    newDescription: parsed.action === "revise_brief" && typeof parsed.newDescription === "string" ? parsed.newDescription.slice(0, 1000) : undefined,
  };
}

/**
 * Reads what Markom actually reported as their obstacle to a checklist
 * brief and decides, like a real Branch Manager would, whether the brief
 * itself was unrealistic given that constraint (revise it to something
 * genuinely achievable, keeping the original marketing intent as close as
 * possible) or whether the obstacle has a workable solution without
 * touching the brief (give concrete, actionable guidance instead). Grounded
 * in Google Search so a revised brief -- or a suggested workaround -- can
 * still be based on a real current idea/tool/reference, not just generic
 * reassurance. Deliberately NOT a rubber stamp: the prompt requires genuine
 * reasoning so the AI doesn't just water down every task someone claims is
 * hard.
 */
export async function resolveMarkomTaskObstacle(input: MarkomObstacleInput): Promise<MarkomObstacleResolution> {
  const systemPrompt = await getSystemPrompt("markom");
  const userPrompt = `Seorang anggota tim Markom melaporkan kendala pada brief checklist konten berikut. Kamu berperan sebagai Branch Manager yang memutuskan tindak lanjutnya -- boleh pakai Google Search kalau perlu referensi konkret (ide konten alternatif yang sedang tren, tutorial/tool untuk mengatasi kendala teknis, dsb).

Brief asli:
Judul: ${input.taskTitle}
Deskripsi: ${input.taskDescription ?? "-"}

Kendala yang dilaporkan Markom:
"${input.obstacleResponse}"

Putuskan salah satu, dengan penalaran jujur (jangan otomatis membenarkan setiap alasan, tapi juga jangan kaku kalau kendalanya memang nyata):
1. "revise_brief" -- jika brief memang tidak realistis dengan kendala nyata ini (mis. tidak ada akses lokasi/bahan, di luar kapasitas tim minggu ini) -- buat versi brief baru yang tetap mencapai tujuan marketing yang sama sedekat mungkin, tapi benar-benar bisa dieksekusi dengan kondisi yang ada. Jangan sekadar menghapus/meniadakan tugasnya.
2. "give_guidance" -- jika kendala itu bisa diatasi tanpa mengubah brief (mis. kurang tahu caranya, perlu koordinasi dengan orang lain, perlu alat/rujukan tertentu) -- berikan langkah konkret yang harus dilakukan Markom untuk menyelesaikan brief aslinya.

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{"action": "revise_brief atau give_guidance", "guidance": "pesan lengkap untuk Markom, Bahasa Indonesia, jelaskan alasan keputusan lalu langkah konkret berikutnya", "newTitle": "judul brief baru, HANYA isi jika action revise_brief", "newDescription": "deskripsi brief baru (format sama seperti brief asli), HANYA isi jika action revise_brief"}`;

  try {
    const response = await generateAIText({ systemPrompt, userPrompt, useWebSearch: true, maxOutputTokens: 1536 });
    return parseObstacleResolutionJson(response.text);
  } catch {
    // fall through to the unresearched fallback below
  }

  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: `${userPrompt}\n\n(Jawab tanpa riset internet.)`, maxOutputTokens: 1024 });
  return parseObstacleResolutionJson(fallbackResponse.text);
}

export interface ContentReviewInput {
  taskTitle: string;
  taskDescription: string | null;
  caption: string | null;
  mediaType: "image" | "video";
  /** Only set for images -- Gemini can actually look at the photo (see AIGenerateRequest.image). There is no equivalent for video here: no frame-level vision, review is caption/brief-only and says so explicitly to Markom. */
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ContentReviewResult {
  verdict: "approved" | "needs_revision";
  feedback: string;
}

function parseContentReviewJson(text: string): ContentReviewResult {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<ContentReviewResult>;
  if (parsed.verdict !== "approved" && parsed.verdict !== "needs_revision") {
    throw new Error("AI content review response missing a valid verdict");
  }
  if (typeof parsed.feedback !== "string" || parsed.feedback.trim().length === 0) {
    throw new Error("AI content review response missing feedback text");
  }
  return { verdict: parsed.verdict, feedback: parsed.feedback.slice(0, 1500) };
}

/**
 * Reviews a finished piece of content Markom uploaded against the checklist
 * brief that asked for it, before it's allowed to be scheduled for
 * publishing. For images this is a REAL visual review -- Gemini is shown
 * the actual photo (AIGenerateRequest.image, gemini-provider.ts) and judges
 * it the way a Branch Manager looking at the file would: does it match the
 * brief's format/subject, is the framing/lighting/quality good enough to
 * post. For video there is no equivalent -- this codebase has no
 * frame-level video understanding -- so the review is caption+brief-only
 * and the prompt makes the AI say so explicitly rather than pretend it
 * watched the video.
 */
export async function reviewContentSubmission(input: ContentReviewInput): Promise<ContentReviewResult> {
  const systemPrompt = await getSystemPrompt("markom");
  const captionLine = input.caption?.trim() ? `Caption yang ditulis Markom: "${input.caption.trim()}"` : "Markom belum menulis caption.";

  if (input.mediaType === "image" && input.imageBase64 && input.imageMimeType) {
    const userPrompt = `Kamu Branch Manager yang meninjau foto konten berikut sebelum diizinkan dijadwalkan tayang ke Instagram. Foto asli terlampir -- benar-benar lihat isinya (framing, pencahayaan, kualitas, kesesuaian subjek dengan brief), jangan hanya menilai dari caption.

Brief asli dari AI:
Judul: ${input.taskTitle}
Deskripsi: ${input.taskDescription ?? "-"}

${captionLine}

Putuskan "approved" (foto sudah cukup baik dan sesuai brief untuk ditayangkan) atau "needs_revision" (jelaskan persis apa yang kurang -- framing, kualitas, tidak sesuai brief, caption perlu diperbaiki, dll).

Balas HANYA dengan JSON object: {"verdict": "approved atau needs_revision", "feedback": "penjelasan singkat untuk Markom, Bahasa Indonesia, sebutkan hal konkret yang dilihat di foto"}`;

    const response = await generateAIText({
      systemPrompt,
      userPrompt,
      image: { data: input.imageBase64, mimeType: input.imageMimeType },
      maxOutputTokens: 1024,
    });
    return parseContentReviewJson(response.text);
  }

  const userPrompt = `Kamu Branch Manager yang meninjau submission konten video berikut sebelum diizinkan dijadwalkan tayang ke Instagram. PENTING: kamu TIDAK bisa menonton isi videonya -- nilai hanya berdasarkan brief dan caption di bawah, dan WAJIB sebutkan keterbatasan ini di feedback-mu serta ingatkan Markom untuk mengecek sendiri kualitas visual/audio videonya sebelum tayang.

Brief asli dari AI:
Judul: ${input.taskTitle}
Deskripsi: ${input.taskDescription ?? "-"}

${captionLine}

Putuskan "approved" (caption & konteks sudah sesuai brief, layak lanjut dengan catatan Markom tetap cek kualitas video sendiri) atau "needs_revision" (caption/konteks tidak sesuai brief).

Balas HANYA dengan JSON object: {"verdict": "approved atau needs_revision", "feedback": "penjelasan singkat, Bahasa Indonesia, termasuk pengingat bahwa AI tidak menonton videonya"}`;

  const response = await generateAIText({ systemPrompt, userPrompt, maxOutputTokens: 1024 });
  return parseContentReviewJson(response.text);
}

export interface AdPhotoOption {
  id: string;
  caption: string | null;
}

export interface AdDraftInput {
  projectName: string;
  projectCity: string | null;
  projectType: string;
  availablePhotos: AdPhotoOption[];
  /** Real buyer-origin cities this ad set will actually be geo-targeted to (see LEASEHOLD_TARGET_CITIES, lib/meta/ads.ts) -- passed so the copy's angle matches who will actually see it, instead of writing generically for "all of Indonesia." */
  targetCities?: string[];
  /** Markom-authored specs/price/USP/target-buyer for this specific project (crm_projects.product_description) -- without this the AI only had name+city+type to work with, which produced generic property copy instead of copy grounded in what's actually being sold. */
  productDescription?: string | null;
}

export interface AdDraft {
  targetSummary: string;
  photoId: string;
  headline: string;
  primaryText: string;
  description: string;
  welcomeMessage: string;
  /** AI's suggested daily spend -- the launch job (ai_job_queue "meta_ads_launch") always clamps this to the remaining META_ADS_DAILY_BUDGET_CAP_IDR, so this is a research-informed suggestion, never the final authority on real spend. */
  suggestedDailyBudgetIdr: number;
  /**
   * Real Google-Search-researched buyer-origin city/regency names for a
   * non-villa project (see the "no audienceLine" branch of the prompt
   * below) -- empty when input.targetCities was already supplied (villa,
   * which uses the fixed LEASEHOLD_TARGET_CITIES list instead) or when the
   * unresearched fallback prompt was used (no internet, nothing to ground
   * a real answer in). Resolved into actual Meta geo targeting by the
   * caller via resolveGeoLocationsFromNames (lib/meta/ads.ts).
   */
  targetAreas: string[];
}

function parseAdDraftJson(text: string, validPhotoIds: string[], projectName: string): AdDraft {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<AdDraft>;
  if (
    typeof parsed.photoId !== "string" ||
    !validPhotoIds.includes(parsed.photoId) ||
    typeof parsed.headline !== "string" ||
    typeof parsed.primaryText !== "string"
  ) {
    throw new Error("AI ad draft response missing required fields or picked a photo that doesn't exist");
  }
  return {
    targetSummary: (parsed.targetSummary ?? "-").slice(0, 1000),
    photoId: parsed.photoId,
    headline: parsed.headline.slice(0, 40),
    primaryText: parsed.primaryText.slice(0, 300),
    description: (parsed.description ?? "").slice(0, 200) || "Hubungi kami sekarang via WhatsApp.",
    welcomeMessage: (parsed.welcomeMessage ?? "").slice(0, 300) || `Terima kasih sudah menghubungi kami mengenai ${projectName}!`,
    suggestedDailyBudgetIdr: Number.isFinite(Number(parsed.suggestedDailyBudgetIdr)) ? Math.max(0, Math.round(Number(parsed.suggestedDailyBudgetIdr))) : 0,
    targetAreas: Array.isArray(parsed.targetAreas)
      ? parsed.targetAreas.filter((a): a is string => typeof a === "string" && a.trim().length > 0).map((a) => a.trim().slice(0, 60)).slice(0, 6)
      : [],
  };
}

/**
 * Researches (Google Search grounding) current viral angles + competitor
 * property ads for ONE specific project, then drafts a complete
 * Click-to-WhatsApp ad from it: which real Markom-uploaded photo fits best,
 * headline/primary text/description/WhatsApp greeting, and a suggested
 * daily budget. Never invents a photo -- must pick photoId from
 * input.availablePhotos, which the caller sources from crm_project_photos
 * (real photos only, see migration 0078).
 */
export async function researchAndDraftAd(input: AdDraftInput): Promise<AdDraft> {
  if (input.availablePhotos.length === 0) {
    throw new Error("No photos available for this project -- Markom must upload at least one real photo before AI can draft an ad");
  }

  const systemPrompt = await getSystemPrompt("markom");
  const photoList = input.availablePhotos.map((p) => `- id: ${p.id}, keterangan: ${p.caption ?? "(tanpa keterangan)"}`).join("\n");
  const audienceLine = input.targetCities?.length
    ? `Audiens: iklan ini akan ditargetkan khusus ke kota-kota ${input.targetCities.join(", ")} (kota-kota asal pembeli villa leasehold berdasarkan data pasar riil kami) -- tulis materi iklan yang relevan untuk audiens dari kota-kota tersebut, bukan generik untuk seluruh Indonesia.`
    : "";
  /**
   * Villa already has a curated, fixed buyer-origin list (LEASEHOLD_TARGET_CITIES)
   * passed in via targetCities -- investor/leasehold buyers can come from any
   * major city. A local housing project (e.g. "perumahan di Cibarusah") has no
   * such list and a different buyer profile: mostly commuters/locals near that
   * specific place, not nationwide investors -- so instead of falling back to
   * wasteful nationwide targeting, have the AI actually research (via the same
   * Google Search grounding used above) real signals about where that area's
   * home buyers typically come from (commuter corridors, toll/train access,
   * property portal listings, local news/forum discussion of the area).
   */
  const areaResearchLine = input.targetCities?.length
    ? ""
    : `\nRISET AREA TARGET (WAJIB pakai Google Search, jangan mengarang): cari tahu dari mana asal rata-rata pembeli rumah di lokasi "${input.projectCity ?? input.projectName}" -- pertimbangkan akses tol/kereta, kota-kota komuter terdekat, dan pola pembeli perumahan sejenis di area itu berdasarkan artikel/listing properti/diskusi yang benar-benar kamu temukan.
BATASAN WAJIB, jangan dilanggar: properti ini (apalagi rumah subsidi/komersial dengan pembeli yang akan menempati dan komuter harian, beda dengan villa investasi) hanya masuk akal untuk pembeli yang jarak tempuh hariannya wajar (kira-kira di bawah 1-1.5 jam berkendara dalam kondisi normal, bukan sekadar "searah ke Jakarta"). JANGAN memasukkan kota/kabupaten besar (terutama wilayah DKI Jakarta) hanya karena sering disebut sebagai daya tarik properti pinggiran -- itu klise pemasaran, bukan data pembeli riil. Setiap kota/kabupaten yang kamu masukkan ke targetAreas HARUS punya alasan konkret dari risetmu (misalnya: berbatasan langsung, akses tol/jalan yang benar-benar dipakai komuter ke lokasi ini, atau ada bukti pembeli riil dari kota itu di listing/diskusi yang kamu temukan) -- sebutkan alasannya di targetSummary, bukan cuma nama kotanya.
Sebutkan 3-6 nama kota/kabupaten NYATA di Indonesia (bukan nama kecamatan/perumahan yang terlalu spesifik, karena harus bisa dikenali sistem targeting iklan) di field "targetAreas". Kalau riset tidak menemukan data yang cukup meyakinkan dan sesuai batasan jarak tempuh di atas, kembalikan array kosong -- jangan menebak atau memaksakan kota yang terlalu jauh.`;
  const productLine = input.productDescription?.trim()
    ? `Detail produk (dari Markom, WAJIB dipakai sebagai fakta utama materi iklan, jangan mengarang spesifikasi/harga lain):\n${input.productDescription.trim()}`
    : "Detail produk: belum diisi Markom -- tulis materi berbasis nama/kota/tipe project saja, jangan mengarang harga atau spesifikasi.";

  // Tujuan iklan ini SELALU sama: maksimalkan klik ke percakapan WhatsApp
  // (hard selling, bukan brand awareness) -- indikator di bawah ini yang
  // menentukan seberapa maksimal hasilnya saat iklan tayang.
  const indicatorsBlock = `Tulis materi iklan dengan menimbang indikator riset berikut (ini yang membedakan iklan yang ramai diklik vs yang tenggelam):
1. HOOK: 3-5 kata pertama primaryText harus menghentikan scroll -- gunakan format hook yang sedang tren di riset Google Search-mu, bukan kalimat pembuka generik ("Dijual villa...", "Kami menawarkan...").
2. FAKTA PRODUK: angka konkret (harga, luas, fasilitas) dari detail produk di atas jauh lebih meyakinkan daripada kata sifat umum ("mewah", "strategis") -- pakai fakta, bukan hanya klaim.
3. SATU CTA JELAS: ajakan tunggal yang mendorong klik chat WhatsApp (hard sell) -- jangan pecah perhatian dengan banyak ajakan sekaligus.
4. RELEVANSI AUDIENS: sesuaikan sudut pandang/bahasa dengan audiens kota target di atas (kalau ada), bukan nada generik nasional.
5. GAYA KOMPETITOR: pakai pola iklan Click-to-WhatsApp properti yang sedang efektif dari riset kompetitor -- jangan meniru persis, tapi pelajari pola yang berhasil (hook, panjang teks, penempatan CTA).
6. KEJUJURAN: jangan mengarang urgensi/diskon/stok terbatas yang tidak ada di detail produk -- urgensi palsu merusak kepercayaan dan performa jangka panjang.`;

  const researchPrompt = `Riset dulu lewat Google Search: (1) hal yang sedang viral/tren di media sosial Indonesia yang relevan untuk audiens pembeli properti/villa, dan (2) gaya iklan Click-to-WhatsApp kompetitor properti yang sedang berjalan di Meta Ads.

Gunakan riset itu untuk membuat draft iklan Click-to-WhatsApp untuk project berikut:
Nama Project: ${input.projectName}
Kota: ${input.projectCity ?? "-"}
Tipe: ${input.projectType}
${audienceLine}
${areaResearchLine}
${productLine}

${indicatorsBlock}

Foto asli yang tersedia (WAJIB pilih salah satu id ini, jangan mengarang foto lain):
${photoList}

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{"targetSummary": "ringkasan riset & alasan target audiens dalam 2-3 kalimat", "photoId": "salah satu id foto di atas", "headline": "maks 40 karakter, menarik perhatian", "primaryText": "maks 300 karakter, ajak chat WhatsApp, Bahasa Indonesia", "description": "maks 200 karakter", "welcomeMessage": "pesan sambutan singkat saat lead membuka chat WhatsApp dari iklan", "suggestedDailyBudgetIdr": angka_rupiah_wajar_untuk_iklan_leads_properti_harian, "targetAreas": ["kota/kabupaten hasil riset area target di atas, array kosong jika tidak relevan/tidak diminta"]}`;

  const photoIds = input.availablePhotos.map((p) => p.id);

  try {
    const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: true, maxOutputTokens: 2048 });
    return parseAdDraftJson(response.text, photoIds, input.projectName);
  } catch {
    // fall through to the unresearched fallback below -- still picks a real photo, just without grounded research backing the copy.
  }

  const fallbackPrompt = `Buatkan draft iklan Click-to-WhatsApp untuk project properti berikut, tanpa riset internet:
Nama Project: ${input.projectName}
Kota: ${input.projectCity ?? "-"}
Tipe: ${input.projectType}
${audienceLine}
${productLine}

${indicatorsBlock}

Foto asli yang tersedia (WAJIB pilih salah satu id ini):
${photoList}

Balas HANYA dengan JSON object: {"targetSummary": "...", "photoId": "...", "headline": "...", "primaryText": "...", "description": "...", "welcomeMessage": "...", "suggestedDailyBudgetIdr": angka}`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1024 });
  return parseAdDraftJson(fallbackResponse.text, photoIds, input.projectName);
}

export interface AdPerformanceInput {
  projectName: string;
  headline: string;
  dailyBudgetIdr: number;
  daysRunning: number;
  spendIdr: number;
  impressions: number;
  clicks: number;
  conversationsStarted: number;
  /** Unique people reached -- lets the AI tell apart "audience exhausted" (reach barely growing while frequency climbs) from "audience is fine, the problem is the offer/creative". */
  reach: number;
  /** Meta's own computed avg impressions per person -- see getAdInsights, lib/meta/ads.ts. Its usual fatigue guidance is ~3-4+ without a creative refresh. */
  frequency: number;
}

/**
 * Turns raw Meta insight numbers (a plain API read, no AI involved in
 * computing them -- see getAdInsights, lib/meta/ads.ts) into a written
 * diagnosis + recommendation. Grounded in Google Search (useWebSearch) so
 * "is this CTR/cost-per-conversation good or bad" is judged against real
 * current benchmarks for Indonesian property Click-to-WhatsApp ads instead
 * of the model's own unverified assumption of what's "normal" -- the same
 * grounding already used for ad copywriting research.
 */
export async function analyzeAdPerformance(input: AdPerformanceInput): Promise<string> {
  const ctr = input.impressions > 0 ? ((input.clicks / input.impressions) * 100).toFixed(2) : "0";
  const costPerConversation = input.conversationsStarted > 0 ? Math.round(input.spendIdr / input.conversationsStarted) : null;
  const costPerClick = input.clicks > 0 ? Math.round(input.spendIdr / input.clicks) : null;

  const userPrompt = `Riset dulu lewat Google Search: benchmark CTR dan biaya per lead/percakapan yang wajar untuk iklan Click-to-WhatsApp properti di Indonesia tahun ini (mis. dari studi kasus agensi ads, laporan benchmark industri, atau diskusi praktisi Meta Ads). Pakai angka riil dari riset itu sebagai pembanding, jangan menebak sendiri apa yang "wajar".

Data performa iklan ini (sumber: Meta Ads Insights API, date_preset=maximum -- akumulasi sejak iklan tayang, bukan cuplikan beberapa hari terakhir):
Project: ${input.projectName}
Headline: ${input.headline}
Budget harian: Rp ${input.dailyBudgetIdr.toLocaleString("id-ID")}
Sudah berjalan: ${input.daysRunning} hari
Total spend: Rp ${input.spendIdr.toLocaleString("id-ID")}
Reach (orang unik terjangkau): ${input.reach.toLocaleString("id-ID")}
Frequency (rata-rata iklan dilihat per orang): ${input.frequency.toFixed(2)}
Impressions: ${input.impressions.toLocaleString("id-ID")}
Klik: ${input.clicks.toLocaleString("id-ID")} (CTR ${ctr}%)${costPerClick !== null ? `, biaya per klik: Rp ${costPerClick.toLocaleString("id-ID")}` : ""}
Percakapan WhatsApp dimulai: ${input.conversationsStarted}${costPerConversation !== null ? ` (biaya per percakapan: Rp ${costPerConversation.toLocaleString("id-ID")})` : " (belum ada percakapan yang masuk)"}

Tulis analisa (Bahasa Indonesia, maksimal 6 kalimat) yang mencakup:
1. Bandingkan CTR dan biaya per percakapan di atas dengan benchmark hasil risetmu -- sebut angka benchmark itu secara eksplisit, jangan hanya bilang "bagus"/"buruk" tanpa pembanding.
2. Diagnosis akar masalah paling mungkin berdasarkan pola data (bukan tebakan generik): frequency tinggi (>3-4) dengan reach stagnan = audiens jenuh/kelelahan materi, CTR rendah dengan frequency wajar = materi/headline kurang menarik atau audiens kurang tepat, klik ada tapi percakapan WA sedikit = welcome message atau respon lambat, budget kecil dengan hari berjalan sedikit = masih dalam learning phase (belum cukup data untuk dinilai final).
3. Tutup dengan dua baris terakhir PERSIS format ini (agar mudah dipindai):
"STATUS: <HIJAU / KUNING / MERAH>" -- HIJAU jika cost per hasil stabil/turun dan tidak ada tanda kelelahan (aman dinaikkan budget), KUNING jika cost per hasil naik 10-20% atau hasil mulai tidak stabil (jangan naikkan dulu), MERAH jika cost per hasil naik >30% atau frequency >3-4 tanpa ganti materi atau CTR turun tajam (hentikan/ganti materi sekarang).
"REKOMENDASI: <PERTAHANKAN / NAIKKAN BUDGET / GANTI MATERI IKLAN / HENTIKAN>" diikuti alasan singkat.`;

  const response = await generateAIText({ systemPrompt: await getSystemPrompt("markom"), userPrompt, useWebSearch: true, maxOutputTokens: 1024 });
  return response.text;
}
