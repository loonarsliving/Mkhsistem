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

function parseChecklistJson(text: string): MarkomChecklistItem[] {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of checklist items");
  return parsed
    .filter((item): item is MarkomChecklistItem => typeof item?.title === "string" && typeof item?.description === "string")
    .map((item) => ({ title: item.title.slice(0, 200), description: item.description.slice(0, 1000) }));
}

/**
 * Researches current viral social-media trends and competitor property/villa
 * ads via Gemini's Google Search grounding (useWebSearch), then turns that
 * research into exactly 3 Markom checklist items -- the basis for
 * markom_run_ai_checklist's every-3-days cron (see migration 0070). Falls
 * back to a plain unresearched checklist prompt if grounded generation
 * fails to parse, rather than losing the whole cycle over one bad response.
 */
export async function researchAndGenerateChecklist(branchName: string): Promise<MarkomChecklistItem[]> {
  const systemPrompt = await getSystemPrompt("markom");
  const researchPrompt = `Riset dulu lewat Google Search: (1) hal-hal yang sedang viral/tren saat ini di media sosial Indonesia yang cocok dijadikan konten untuk villa leasehold, dan (2) strategi iklan kompetitor properti/villa yang sedang berjalan.

Gunakan hasil riset itu sebagai dasar untuk membuat TEPAT 3 checklist task untuk tim Markom cabang "${branchName}" pada siklus kerja 3 hari ke depan -- task harus konkret dan berdasar temuan riset, bukan ide generik.

Balas HANYA dengan JSON array (tanpa markdown code fence, tanpa penjelasan tambahan) berisi tepat 3 object:
[{"title": "...", "description": "..."}]

title: singkat (maks 80 karakter), actionable.
description: 1-2 kalimat, sebutkan tren/kompetitor spesifik dari hasil riset yang mendasari task ini.`;

  try {
    const response = await generateAIText({ systemPrompt, userPrompt: researchPrompt, useWebSearch: true, maxOutputTokens: 2048 });
    const items = parseChecklistJson(response.text);
    if (items.length > 0) return items.slice(0, 3);
  } catch {
    // fall through to the unresearched fallback below
  }

  const fallbackPrompt = `Buatkan TEPAT 3 checklist task untuk tim Markom cabang "${branchName}" pada siklus kerja 3 hari ke depan, seputar konten villa leasehold dan strategi marketing properti umum.

Balas HANYA dengan JSON array berisi tepat 3 object: [{"title": "...", "description": "..."}]`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1024 });
  const fallbackItems = parseChecklistJson(fallbackResponse.text);
  if (fallbackItems.length === 0) throw new Error("AI did not return a parseable checklist");
  return fallbackItems.slice(0, 3);
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
  const researchPrompt = `Riset dulu lewat Google Search: (1) hal yang sedang viral/tren di media sosial Indonesia yang relevan untuk audiens pembeli properti/villa, dan (2) gaya iklan Click-to-WhatsApp kompetitor properti yang sedang berjalan di Meta Ads.

Gunakan riset itu untuk membuat draft iklan Click-to-WhatsApp untuk project berikut:
Nama Project: ${input.projectName}
Kota: ${input.projectCity ?? "-"}
Tipe: ${input.projectType}

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

Foto asli yang tersedia (WAJIB pilih salah satu id ini):
${photoList}

Balas HANYA dengan JSON object: {"targetSummary": "...", "photoId": "...", "headline": "...", "primaryText": "...", "description": "...", "welcomeMessage": "...", "suggestedDailyBudgetIdr": angka}`;
  const fallbackResponse = await generateAIText({ systemPrompt, userPrompt: fallbackPrompt, maxOutputTokens: 1024 });
  return parseAdDraftJson(fallbackResponse.text, photoIds, input.projectName);
}
