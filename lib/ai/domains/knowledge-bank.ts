import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

/**
 * Fixed topic list -- each gets its own row in ai_knowledge_bank and its own
 * knowledge_bank_refresh job, refreshed weekly (0115). Deliberately narrow:
 * platform-level knowledge that changes slowly (algorithm behavior, current
 * best practices), not project-specific research (that stays live-searched
 * in markom.ts's dedicated functions, which need current, per-campaign data
 * a weekly cache can't provide).
 */
export const KNOWLEDGE_TOPICS = [
  {
    topic: "meta_ads_strategy",
    title: "Strategi & Algoritma Meta Ads (Facebook/Instagram Ads, Click-to-WhatsApp)",
    researchPrompt:
      "Riset temuan TERBARU (beberapa bulan terakhir) tentang: cara kerja sistem lelang & algoritma Meta Ads saat ini, best practice untuk Click-to-WhatsApp ads, benchmark biaya per klik/per percakapan WhatsApp yang wajar untuk industri properti di Indonesia, dan perubahan kebijakan/fitur Meta Ads yang relevan untuk pengiklan skala kecil-menengah.",
  },
  {
    topic: "instagram_strategy",
    title: "Algoritma & Strategi Konten Instagram",
    researchPrompt:
      "Riset temuan TERBARU tentang algoritma Instagram (Reels, feed, Explore) -- sinyal ranking yang paling berpengaruh saat ini, format/panjang konten yang sedang berkinerja baik, dan perubahan kebijakan/fitur terbaru yang relevan untuk akun bisnis kecil-menengah.",
  },
  {
    topic: "tiktok_strategy",
    title: "Algoritma & Strategi Konten/TikTok Ads",
    researchPrompt:
      "Riset temuan TERBARU tentang algoritma FYP TikTok, tren format konten yang sedang viral, strategi TikTok Ads/Spark Ads, dan perubahan kebijakan/fitur terbaru yang relevan untuk pengiklan skala kecil-menengah di Indonesia.",
  },
  {
    topic: "digital_marketing_general",
    title: "Tren Pemasaran Digital Properti Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang tren pemasaran digital untuk industri properti di Indonesia: perilaku pencarian/pembelian rumah subsidi, rumah komersial, dan villa investasi, channel yang paling efektif saat ini, dan benchmark biaya marketing/lead yang wajar per segmen.",
  },
] as const;

export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number]["topic"];

const KNOWLEDGE_TOPIC_NAMES: readonly string[] = KNOWLEDGE_TOPICS.map((t) => t.topic);

/** One Gemini + Google Search grounding call per topic, upserted into ai_knowledge_bank -- called by the knowledge_bank_refresh job (process-job/route.ts), never inline in a chat request. */
export async function processKnowledgeBankRefreshJob(topic: string): Promise<{ topic: string; contentLength: number }> {
  const def = KNOWLEDGE_TOPICS.find((t) => t.topic === topic);
  if (!def) {
    throw new Error(`Unknown knowledge bank topic: ${topic}`);
  }

  const response = await generateAIText({
    systemPrompt:
      "Anda adalah riset analis pemasaran digital untuk sebuah perusahaan properti di Indonesia. Rangkum temuan riset Anda secara padat, konkret, dan actionable dalam Bahasa Indonesia -- poin-poin yang benar-benar bisa langsung dipakai tim Markom, bukan teori umum atau basa-basi. Sekitar 400-600 kata.",
    userPrompt: def.researchPrompt,
    useWebSearch: true,
    maxOutputTokens: 2048,
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ai_knowledge_bank")
    .upsert(
      { topic: def.topic, title: def.title, content: response.text, researched_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: "topic" },
    );
  if (error) throw new Error(`Failed to save knowledge bank topic ${topic}: ${error.message}`);

  return { topic, contentLength: response.text.length };
}

interface CachedContext {
  text: string;
  cachedAt: number;
}

let cachedContext: CachedContext | null = null;
const CONTEXT_CACHE_TTL_MS = 5 * 60_000;

/**
 * Cached (5 min) block of every ai_knowledge_bank row, joined into one text
 * block -- injected into the Markom system prompt (prompts.ts) so questions
 * about Meta/Instagram/TikTok strategy are grounded in recently-researched
 * knowledge without a live Google Search call on every single chat message.
 * Empty string if the bank hasn't been populated yet (first weekly refresh
 * hasn't run) -- callers append conditionally, never on an empty string.
 */
export async function getKnowledgeBankContext(): Promise<string> {
  if (cachedContext && Date.now() - cachedContext.cachedAt < CONTEXT_CACHE_TTL_MS) return cachedContext.text;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ai_knowledge_bank").select("title, content, researched_at").order("topic");
  if (error || !data || data.length === 0) return "";

  const text = data
    .map((row) => `### ${row.title} (riset terakhir: ${new Date(row.researched_at).toLocaleDateString("id-ID")})\n${row.content}`)
    .join("\n\n");

  cachedContext = { text, cachedAt: Date.now() };
  return text;
}

export function isKnownKnowledgeTopic(topic: string): boolean {
  return KNOWLEDGE_TOPIC_NAMES.includes(topic);
}
