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
