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
}

function buildContentPlannerContextBlock(context?: ContentPlannerContext): string {
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
    lines.push(`Performa TikTok kami (data nyata): ${tt.videoViews} video views, ${tt.likes} likes, ${tt.followersCount} followers.`);
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
export async function researchAndGenerateChecklist(branchName: string, context?: ContentPlannerContext): Promise<MarkomChecklistItem[]> {
  const systemPrompt = await getSystemPrompt("markom");
  const contextBlock = buildContentPlannerContextBlock(context);
  const researchPrompt = `Riset dulu lewat Google Search: (1) hal-hal yang sedang viral/tren saat ini di media sosial Indonesia (khususnya TikTok dan Instagram, cari data publik yang ter-index Google karena tidak ada akses API resmi TikTok) yang cocok dijadikan konten untuk villa leasehold, dan (2) aktivitas publik kompetitor yang terdaftar di bawah (jika ada) -- cari konten/postingan terbaru mereka yang bisa ditemukan lewat pencarian publik.${contextBlock}

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

  const fallbackPrompt = `Buatkan TEPAT 3 checklist konten untuk tim Markom cabang "${branchName}" pada siklus kerja 3 hari ke depan, seputar konten villa leasehold dan strategi marketing properti umum, tanpa riset internet.${contextBlock}

description WAJIB mencakup: format konten, hook pembuka, durasi ideal, gaya editing, draft caption, CTA, hashtag, dan jam upload terbaik.
platform: WAJIB pilih "Instagram" atau "TikTok" per checklist, boleh beda-beda.
platformReason: 1 kalimat kenapa platform itu yang dipilih.

Balas HANYA dengan JSON array berisi tepat 3 object: [{"title": "...", "description": "...", "platform": "...", "platformReason": "..."}]`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1536 });
  const fallbackItems = parseChecklistJson(fallbackResponse.text);
  if (fallbackItems.length === 0) throw new Error("AI did not return a parseable checklist");
  return fallbackItems.slice(0, 3);
}

export interface WeeklyContentPerformanceInput {
  instagramThisWeek?: { reach: number; profileViews: number; followersCount: number } | null;
  instagramLastWeek?: { reach: number; profileViews: number; followersCount: number } | null;
  tiktokThisWeek?: { videoViews: number; likes: number; followersCount: number } | null;
  competitorNotes: string[];
}

/**
 * Weekly "what worked, what didn't, and why" -- the one part of content
 * evaluation that genuinely needs AI (interpreting a week of real numbers +
 * competitor observations into a written verdict and next-week
 * recommendation), same principle as analyzeAdPerformance.
 */
export async function evaluateWeeklyContentPerformance(input: WeeklyContentPerformanceInput): Promise<string> {
  const igLine = input.instagramThisWeek
    ? `Instagram minggu ini: reach ${input.instagramThisWeek.reach}, profile views ${input.instagramThisWeek.profileViews}, followers ${input.instagramThisWeek.followersCount}.` +
      (input.instagramLastWeek ? ` Minggu lalu: reach ${input.instagramLastWeek.reach}, profile views ${input.instagramLastWeek.profileViews}.` : "")
    : "Data Instagram tidak tersedia.";
  const ttLine = input.tiktokThisWeek
    ? `TikTok minggu ini: ${input.tiktokThisWeek.videoViews} video views, ${input.tiktokThisWeek.likes} likes, ${input.tiktokThisWeek.followersCount} followers.`
    : "Data TikTok tidak tersedia.";
  const competitorBlock = input.competitorNotes.length > 0 ? `Observasi konten kompetitor minggu ini:\n${input.competitorNotes.join("\n")}` : "Tidak ada catatan kompetitor minggu ini.";

  const userPrompt = `Evaluasi performa konten media sosial perusahaan minggu ini:

${igLine}
${ttLine}

${competitorBlock}

Berikan evaluasi (Bahasa Indonesia, 4-6 kalimat): (1) apa yang berhasil minggu ini dan kemungkinan penyebabnya, (2) apa yang kurang berhasil dan kemungkinan penyebabnya, (3) perubahan strategi kompetitor yang terlihat (jika ada catatan), (4) rekomendasi konkret untuk strategi konten minggu depan.`;

  return askAI(await getSystemPrompt("markom"), userPrompt);
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
  const researchPrompt = `Riset dulu lewat Google Search: (1) hal yang sedang viral/tren di media sosial Indonesia yang relevan untuk audiens pembeli properti/villa, dan (2) gaya iklan Click-to-WhatsApp kompetitor properti yang sedang berjalan di Meta Ads.

Gunakan riset itu untuk membuat draft iklan Click-to-WhatsApp untuk project berikut:
Nama Project: ${input.projectName}
Kota: ${input.projectCity ?? "-"}
Tipe: ${input.projectType}
${audienceLine}

Foto asli yang tersedia (WAJIB pilih salah satu id ini, jangan mengarang foto lain):
${photoList}

Balas HANYA dengan JSON object (tanpa markdown code fence, tanpa penjelasan tambahan):
{"targetSummary": "ringkasan riset & alasan target audiens dalam 2-3 kalimat", "photoId": "salah satu id foto di atas", "headline": "maks 40 karakter, menarik perhatian", "primaryText": "maks 300 karakter, ajak chat WhatsApp, Bahasa Indonesia", "description": "maks 200 karakter", "welcomeMessage": "pesan sambutan singkat saat lead membuka chat WhatsApp dari iklan", "suggestedDailyBudgetIdr": angka_rupiah_wajar_untuk_iklan_leads_properti_harian}`;

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
}

/**
 * Turns raw Meta insight numbers (a plain API read, no AI involved in
 * computing them -- see getAdInsights, lib/meta/ads.ts) into a short
 * written analysis + recommendation. This is the one part of "analyze the
 * running ad" that genuinely needs generation: interpreting CTR/cost-per-
 * conversation against the campaign's own context and saying what to do
 * next, the way a human ads specialist would -- not just restating numbers
 * the UI can already display directly.
 */
export async function analyzeAdPerformance(input: AdPerformanceInput): Promise<string> {
  const ctr = input.impressions > 0 ? ((input.clicks / input.impressions) * 100).toFixed(2) : "0";
  const costPerConversation = input.conversationsStarted > 0 ? Math.round(input.spendIdr / input.conversationsStarted) : null;

  const userPrompt = `Analisa performa iklan Click-to-WhatsApp berikut dan berikan rekomendasi tindakan:

Project: ${input.projectName}
Headline: ${input.headline}
Budget harian: Rp ${input.dailyBudgetIdr.toLocaleString("id-ID")}
Sudah berjalan: ${input.daysRunning} hari
Total spend: Rp ${input.spendIdr.toLocaleString("id-ID")}
Impressions: ${input.impressions.toLocaleString("id-ID")}
Klik: ${input.clicks.toLocaleString("id-ID")} (CTR ${ctr}%)
Percakapan WhatsApp dimulai: ${input.conversationsStarted}${costPerConversation !== null ? ` (biaya per percakapan: Rp ${costPerConversation.toLocaleString("id-ID")})` : " (belum ada percakapan yang masuk)"}

Berikan analisa singkat (3-5 kalimat, Bahasa Indonesia): (1) apakah performa ini baik/wajar/buruk untuk iklan leads properti, (2) kemungkinan penyebab jika buruk (foto kurang menarik, headline kurang relevan, budget terlalu kecil, atau audiens belum tepat), (3) rekomendasi konkret -- lanjutkan, naikkan budget, ganti foto/materi, atau hentikan.`;

  return askAI(await getSystemPrompt("markom"), userPrompt);
}
