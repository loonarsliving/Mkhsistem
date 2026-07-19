import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

/**
 * Fixed topic list -- each gets its own row in ai_knowledge_bank and its own
 * knowledge_bank_refresh job, refreshed weekly (0115). Deliberately scoped
 * to PT Maha Karya Haluoleo's actual two products (rumah subsidi/komersial
 * and villa leasehold) -- generic multi-product marketing knowledge made
 * the WhatsApp AI's answers feel disconnected from what employees actually
 * discuss (leasehold vs freehold objections, FLPP financing questions,
 * property-specific closing technique), not the underlying platform trivia.
 * Never injected into loonars_beauty's prompt (see prompts.ts) -- that's a
 * different product (skincare) this knowledge would only pollute.
 */
export const KNOWLEDGE_TOPICS = [
  {
    topic: "villa_leasehold_market",
    title: "Pasar & Strategi Penjualan Villa Leasehold Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang pasar villa leasehold di Indonesia (fokus Bali, Jogja, dan lokasi investasi populer sejenis): profil & motivasi pembeli (investor asing vs lokal), perbedaan leasehold vs freehold dari sisi hukum dan daya tarik jual, argumen ROI/yield sewa yang biasa dipakai dalam pitch penjualan, keberatan/pertanyaan umum calon pembeli (legalitas, masa sewa, exit strategy) dan cara menjawabnya, serta tren harga/permintaan terkini.",
  },
  {
    topic: "subsidized_housing_market",
    title: "Pasar & Strategi Penjualan Rumah Subsidi/Komersial Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang pasar rumah subsidi dan rumah komersial di Indonesia: profil pembeli, proses & syarat KPR/FLPP terkini, kebijakan pemerintah terbaru soal perumahan subsidi (plafon harga, subsidi bunga, dll), keberatan/pertanyaan umum calon pembeli dan cara menjawabnya, serta strategi marketing yang terbukti efektif untuk segmen ini.",
  },
  {
    topic: "property_sales_closing_technique",
    title: "Teknik Closing & Objection Handling Penjualan Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang teknik closing dan penanganan keberatan yang efektif KHUSUS untuk penjualan properti (rumah/villa) -- bukan produk konsumer biasa, karena siklus keputusan lebih panjang dan nilai transaksi besar. Cakup: cara menangani keberatan harga, keraguan terhadap kredibilitas developer, kekhawatiran proses legal/KPR, dan strategi follow-up yang terbukti efektif untuk lead properti yang belum closing.",
  },
  {
    topic: "meta_ads_property_ctwa",
    title: "Strategi Meta Ads Click-to-WhatsApp untuk Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang praktik terbaik Meta Ads Click-to-WhatsApp KHUSUS untuk industri properti: benchmark biaya per klik/per percakapan WhatsApp yang wajar, dibedakan untuk segmen rumah subsidi (harga rendah, keputusan cepat) vs villa leasehold investasi (harga tinggi, keputusan panjang), cara menyusun audiens dan funnel yang efektif untuk masing-masing segmen, dan perubahan kebijakan/fitur Meta Ads yang relevan.",
  },
  {
    topic: "instagram_tiktok_property_content",
    title: "Strategi Konten Instagram & TikTok untuk Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi konten Instagram dan TikTok KHUSUS untuk marketing properti: format/hook yang terbukti efektif menarik minat pembeli rumah subsidi maupun villa investasi (studi kasus/contoh nyata kalau ada), algoritma terkini kedua platform, dan perubahan fitur/kebijakan yang relevan untuk akun bisnis properti skala kecil-menengah.",
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
