import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

export type ProductLine = "property" | "beauty";

/**
 * Fixed topic list -- each gets its own row in ai_knowledge_bank and its own
 * knowledge_bank_refresh job, refreshed weekly (0115). Two separate,
 * never-mixed knowledge sets (productLine) since PT Maha Karya Haluoleo
 * sells two unrelated products -- property (rumah subsidi/komersial, villa
 * leasehold) and Loonars Beauty (skincare). getKnowledgeBankContext filters
 * by productLine so a markom/crm answer about property never pulls in
 * skincare content and vice versa (see prompts.ts).
 */
export const KNOWLEDGE_TOPICS = [
  {
    topic: "villa_leasehold_market",
    productLine: "property" as ProductLine,
    title: "Pasar & Strategi Penjualan Villa Leasehold Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang pasar villa leasehold di Indonesia (fokus Bali, Jogja, dan lokasi investasi populer sejenis): profil & motivasi pembeli (investor asing vs lokal), perbedaan leasehold vs freehold dari sisi hukum dan daya tarik jual, argumen ROI/yield sewa yang biasa dipakai dalam pitch penjualan, keberatan/pertanyaan umum calon pembeli (legalitas, masa sewa, exit strategy) dan cara menjawabnya, serta tren harga/permintaan terkini.",
  },
  {
    topic: "subsidized_housing_market",
    productLine: "property" as ProductLine,
    title: "Pasar & Strategi Penjualan Rumah Subsidi/Komersial Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang pasar rumah subsidi dan rumah komersial di Indonesia: profil pembeli, proses & syarat KPR/FLPP terkini, kebijakan pemerintah terbaru soal perumahan subsidi (plafon harga, subsidi bunga, dll), keberatan/pertanyaan umum calon pembeli dan cara menjawabnya, serta strategi marketing yang terbukti efektif untuk segmen ini.",
  },
  {
    topic: "property_sales_closing_technique",
    productLine: "property" as ProductLine,
    title: "Teknik Closing & Objection Handling Penjualan Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang teknik closing dan penanganan keberatan yang efektif KHUSUS untuk penjualan properti (rumah/villa) -- bukan produk konsumer biasa, karena siklus keputusan lebih panjang dan nilai transaksi besar. Cakup: cara menangani keberatan harga, keraguan terhadap kredibilitas developer, kekhawatiran proses legal/KPR, dan strategi follow-up yang terbukti efektif untuk lead properti yang belum closing.",
  },
  {
    topic: "meta_ads_property_ctwa",
    productLine: "property" as ProductLine,
    title: "Strategi Meta Ads Click-to-WhatsApp untuk Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang praktik terbaik Meta Ads Click-to-WhatsApp KHUSUS untuk industri properti: benchmark biaya per klik/per percakapan WhatsApp yang wajar, dibedakan untuk segmen rumah subsidi (harga rendah, keputusan cepat) vs villa leasehold investasi (harga tinggi, keputusan panjang), cara menyusun audiens dan funnel yang efektif untuk masing-masing segmen, dan perubahan kebijakan/fitur Meta Ads yang relevan.",
  },
  {
    topic: "instagram_tiktok_property_content",
    productLine: "property" as ProductLine,
    title: "Strategi Konten Instagram & TikTok untuk Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi konten Instagram dan TikTok KHUSUS untuk marketing properti: format/hook yang terbukti efektif menarik minat pembeli rumah subsidi maupun villa investasi (studi kasus/contoh nyata kalau ada), algoritma terkini kedua platform, dan perubahan fitur/kebijakan yang relevan untuk akun bisnis properti skala kecil-menengah.",
  },
  {
    topic: "beauty_market_indonesia",
    productLine: "beauty" as ProductLine,
    title: "Pasar & Tren Skincare Brightening Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang pasar skincare brightening/whitening di Indonesia: profil & perilaku pembeli, tren bahan aktif/klaim yang sedang diminati, kompetitor populer di segmen harga menengah, dan regulasi BPOM yang relevan untuk produk lotion/skincare.",
  },
  {
    topic: "beauty_social_commerce_strategy",
    productLine: "beauty" as ProductLine,
    title: "Strategi Jualan Skincare via Shopee/Tokopedia/TikTok Shop",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi jualan skincare via Shopee, Tokopedia, dan TikTok Shop di Indonesia: taktik optimasi listing, strategi promo/flash sale yang efektif, penggunaan affiliate/live shopping TikTok, dan benchmark konversi yang wajar untuk produk skincare harga menengah.",
  },
  {
    topic: "beauty_content_strategy",
    productLine: "beauty" as ProductLine,
    title: "Strategi Konten TikTok/Instagram untuk Produk Skincare",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi konten TikTok dan Instagram KHUSUS untuk produk skincare: format/hook yang terbukti efektif (before-after, UGC, problem-solution), rasio konten yang sedang berkinerja baik, dan perubahan algoritma/fitur terkini yang relevan untuk akun bisnis skincare skala kecil-menengah.",
  },
  {
    topic: "beauty_sales_closing_technique",
    productLine: "beauty" as ProductLine,
    title: "Teknik Closing & Objection Handling Penjualan Skincare via WhatsApp/DM",
    researchPrompt:
      "Riset temuan TERBARU tentang teknik closing dan penanganan keberatan yang efektif untuk penjualan skincare via WhatsApp/DM: cara menangani keberatan harga, keraguan keamanan/BPOM, pertanyaan cara pakai, dan strategi follow-up yang terbukti efektif untuk calon pembeli yang belum checkout.",
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
      def.productLine === "beauty"
        ? "Anda adalah riset analis pemasaran digital untuk sebuah brand skincare di Indonesia. Rangkum temuan riset Anda secara padat, konkret, dan actionable dalam Bahasa Indonesia -- poin-poin yang benar-benar bisa langsung dipakai tim, bukan teori umum atau basa-basi. Sekitar 400-600 kata."
        : "Anda adalah riset analis pemasaran digital untuk sebuah perusahaan properti di Indonesia. Rangkum temuan riset Anda secara padat, konkret, dan actionable dalam Bahasa Indonesia -- poin-poin yang benar-benar bisa langsung dipakai tim Markom, bukan teori umum atau basa-basi. Sekitar 400-600 kata.",
    userPrompt: def.researchPrompt,
    useWebSearch: true,
    maxOutputTokens: 2048,
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ai_knowledge_bank")
    .upsert(
      {
        topic: def.topic,
        product_line: def.productLine,
        title: def.title,
        content: response.text,
        researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "topic" },
    );
  if (error) throw new Error(`Failed to save knowledge bank topic ${topic}: ${error.message}`);

  return { topic, contentLength: response.text.length };
}

interface CachedContext {
  text: string;
  cachedAt: number;
}

const contextCache = new Map<ProductLine, CachedContext>();
const CONTEXT_CACHE_TTL_MS = 5 * 60_000;

/**
 * Cached (5 min) block of every ai_knowledge_bank row for one product line,
 * joined into one text block -- injected into the relevant system prompt
 * (prompts.ts: property -> markom/crm, beauty -> loonars_beauty) so
 * questions are grounded in recently-researched, product-specific
 * knowledge without a live Google Search call on every single chat
 * message. Empty string if that product line's bank hasn't been populated
 * yet or is unreadable -- callers append conditionally, never on an empty
 * string.
 */
export async function getKnowledgeBankContext(productLine: ProductLine): Promise<string> {
  const cached = contextCache.get(productLine);
  if (cached && Date.now() - cached.cachedAt < CONTEXT_CACHE_TTL_MS) return cached.text;

  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ai_knowledge_bank").select("title, content, researched_at").eq("product_line", productLine).order("topic");
  if (error || !data || data.length === 0) return "";

  const text = data
    .map((row) => `### ${row.title} (riset terakhir: ${new Date(row.researched_at).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" })})\n${row.content}`)
    .join("\n\n");

  contextCache.set(productLine, { text, cachedAt: Date.now() });
  return text;
}

export function isKnownKnowledgeTopic(topic: string): boolean {
  return KNOWLEDGE_TOPIC_NAMES.includes(topic);
}
