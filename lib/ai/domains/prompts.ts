import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const PROMPT_KEYS = ["general", "hr", "markom", "crm"] as const;
export type PromptKey = (typeof PROMPT_KEYS)[number];

/** Original hardcoded prompts, kept as the fallback if ai_system_prompts is ever unreadable or a row is missing -- the AI must never go silent just because Modul AI's table has a hiccup. */
const DEFAULT_PROMPTS: Record<PromptKey, string> = {
  general: `Anda adalah MK Connect AI, asisten AI internal PT Maha Karya Haluoleo yang bisa membantu topik HR, Markom (Marketing & Komunikasi), dan CRM (penjualan/prospek).
Jawab dalam Bahasa Indonesia, singkat dan jelas. Jika pertanyaan di luar cakupan HR/Markom/CRM perusahaan, katakan Anda hanya bisa membantu topik tersebut.`,
  hr: `Anda adalah AI HR Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo.
Tugas Anda: menjawab pertanyaan HR, memberi rekomendasi SOP, membuat checklist HR, dan membantu evaluasi karyawan.
Jawab dalam Bahasa Indonesia, singkat, jelas, dan actionable. Jangan mengarang kebijakan perusahaan yang tidak diberikan sebagai konteks — jika tidak yakin, katakan bahwa hal tersebut perlu dikonfirmasi ke HR.`,
  markom: `Anda adalah AI Markom (Marketing & Komunikasi) Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti: rumah subsidi, rumah komersial, villa, dan produk turunan seperti Loonars Beauty).
Tugas Anda: membuat checklist marketing, mencari referensi ide campaign, memberi ide konten, membuat weekly checklist tim Markom, dan membuat evaluasi marketing.
Jawab dalam Bahasa Indonesia, ringkas, praktis, dan relevan dengan industri properti Indonesia.`,
  crm: `Anda adalah AI CRM Assistant untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti).
Tugas Anda: memberi insight prospek, membantu follow up, memberi rekomendasi closing, dan memberi analisa pipeline penjualan.
Jawab dalam Bahasa Indonesia, ringkas, dan berorientasi pada tindakan penjualan berikutnya (next action).`,
};

interface CachedPrompts {
  prompts: Record<PromptKey, string>;
  cachedAt: number;
}

let cache: CachedPrompts | null = null;
const CACHE_TTL_MS = 60_000;

async function loadPrompts(): Promise<Record<PromptKey, string>> {
  if (cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) return cache.prompts;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ai_system_prompts").select("key, content");

  const prompts = { ...DEFAULT_PROMPTS };
  if (error) {
    logger.error("Failed to load ai_system_prompts, using hardcoded defaults", { error: error.message });
  } else {
    for (const row of data ?? []) {
      if ((PROMPT_KEYS as readonly string[]).includes(row.key) && row.content.trim().length > 0) {
        prompts[row.key as PromptKey] = row.content;
      }
    }
  }

  cache = { prompts, cachedAt: Date.now() };
  return prompts;
}

/** Admin-editable system prompt for a domain (Modul AI) -- always resolves to *something*, falling back to the original hardcoded copy on any read failure or missing row. */
export async function getSystemPrompt(key: PromptKey): Promise<string> {
  const prompts = await loadPrompts();
  return prompts[key];
}
