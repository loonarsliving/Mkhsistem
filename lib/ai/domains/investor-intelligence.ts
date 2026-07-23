import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

/**
 * Investor Intelligence knowledge bank (0126) -- distilled villa leasehold
 * investor psychology, refreshed weekly via Gemini + Google Search
 * grounding. Feeds the Sales Teaching Engine's weekly branch briefing
 * (sales-teaching.ts) -- never a chat system prompt, never read by any UI.
 */
export const INVESTOR_INTELLIGENCE_TOPICS = [
  {
    topic: "investor_menengah_behavior",
    title: "Behavior Investor Kelas Menengah Indonesia",
    researchPrompt:
      "Riset temuan TERBARU tentang perilaku investor kelas menengah di Indonesia yang mempertimbangkan investasi properti: bagaimana mereka mencari informasi, siapa yang mempengaruhi keputusan mereka (keluarga, komunitas, media sosial, influencer keuangan), toleransi risiko, preferensi jenis investasi (properti vs instrumen lain), dan kekhawatiran finansial umum yang mereka bawa saat mempertimbangkan pembelian properti investasi.",
  },
  {
    topic: "villa_leasehold_investor_behavior",
    title: "Behavior Calon Investor Villa Leasehold",
    researchPrompt:
      "Riset temuan TERBARU tentang perilaku dan profil calon investor villa leasehold di Indonesia (fokus Bali, Jogja, dan lokasi investasi villa serupa): motivasi utama (passive income sewa, apresiasi nilai, gaya hidup), asal investor (lokal vs asing/ekspatriat), kekhawatiran spesifik terhadap skema leasehold (masa sewa, hak milik, exit strategy), dan bagaimana keputusan mereka berbeda dari pembeli rumah tinggal biasa.",
  },
  {
    topic: "investment_decision_pattern",
    title: "Pola Pengambilan Keputusan Investasi Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang pola pengambilan keputusan calon investor properti: berapa lama siklus keputusan biasanya (dari kenal produk sampai closing), tahapan/titik keraguan yang paling sering muncul, peran perbandingan dengan kompetitor/proyek lain, dan pemicu (trigger) yang biasanya mempercepat keputusan akhir.",
  },
  {
    topic: "investor_trust_factors",
    title: "Faktor Peningkat & Penurun Kepercayaan Investor",
    researchPrompt:
      "Riset temuan TERBARU tentang faktor yang meningkatkan maupun menurunkan kepercayaan calon investor properti terhadap developer/penjual: bukti sosial (testimoni, unit terjual, legalitas), transparansi informasi finansial/legal, respons terhadap pertanyaan sulit, red flag umum yang membuat calon investor mundur, dan peran reputasi developer/track record proyek sebelumnya.",
  },
  {
    topic: "investor_rejection_reasons",
    title: "Alasan Umum Calon Investor Menolak Pembelian",
    researchPrompt:
      "Riset temuan TERBARU tentang alasan paling umum calon investor menolak/menunda pembelian villa leasehold atau properti investasi serupa: keberatan harga/return yang dirasa kurang meyakinkan, keraguan legalitas/masa sewa, kekhawatiran likuiditas (susah dijual kembali), pengalaman buruk dengan developer lain, dan faktor eksternal (kondisi ekonomi, sentimen pasar).",
  },
  {
    topic: "closing_drivers",
    title: "Faktor yang Mendorong Closing",
    researchPrompt:
      "Riset temuan TERBARU tentang faktor yang benar-benar mendorong closing pada penjualan villa leasehold/properti investasi: urgensi (kuota unit terbatas, kenaikan harga), bukti ROI konkret (studi kasus penyewaan nyata), kemudahan skema pembayaran, kepercayaan personal terhadap sales/tim closing, dan momen/konteks yang biasanya jadi titik balik keputusan pembeli.",
  },
  {
    topic: "trust_building_technique",
    title: "Cara Membangun Trust dengan Calon Investor",
    researchPrompt:
      "Riset temuan TERBARU tentang teknik membangun kepercayaan (trust) dengan calon investor properti sejak kontak pertama: cara komunikasi yang transparan dan tidak terkesan memaksa, penggunaan data/bukti nyata (bukan klaim kosong), cara menjawab pertanyaan sulit soal legalitas/keuangan tanpa terkesan menghindar, dan kesalahan komunikasi yang justru merusak trust.",
  },
  {
    topic: "investor_long_term_relationship",
    title: "Membangun Hubungan Jangka Panjang dengan Calon Investor",
    researchPrompt:
      "Riset temuan TERBARU tentang cara membangun hubungan jangka panjang dengan calon investor properti, termasuk yang belum closing: strategi nurturing/follow-up berkala yang tidak terkesan mengganggu, cara tetap relevan di mata calon investor selama masa pertimbangan panjang, pemanfaatan calon investor lama sebagai sumber referral, dan cara menjaga hubungan baik dengan investor yang sudah closing agar repeat/referral.",
  },
] as const;

export type InvestorIntelligenceTopic = (typeof INVESTOR_INTELLIGENCE_TOPICS)[number]["topic"];

const TOPIC_NAMES: readonly string[] = INVESTOR_INTELLIGENCE_TOPICS.map((t) => t.topic);

const RESEARCH_SYSTEM_PROMPT = `Anda adalah analis psikologi penjualan & investasi untuk sebuah perusahaan properti di Indonesia yang menjual villa leasehold (produk investasi, bukan rumah tinggal biasa). Rangkum temuan riset Anda secara padat, konkret, dan actionable dalam Bahasa Indonesia -- poin-poin yang benar-benar bisa langsung dipakai untuk membimbing Kepala Cabang dan tim Sales, bukan teori umum atau basa-basi.

Format jawaban dengan sub-header dari kategori berikut, HANYA yang benar-benar relevan untuk topik ini (jangan paksakan semua kategori pada setiap topik): POLA (pattern yang ditemukan), CHECKLIST (langkah konkret), SOP (urutan tindakan baku), BEST PRACTICE, OBJEKSI UMUM & CARA MENJAWAB, STRATEGI CLOSING. Sekitar 400-600 kata.`;

/** One Gemini + Google Search grounding call per topic, upserted into ai_investor_intelligence_bank -- called by the investor_intelligence_refresh job (process-job/route.ts). */
export async function processInvestorIntelligenceRefreshJob(topic: string): Promise<{ topic: string; contentLength: number }> {
  const def = INVESTOR_INTELLIGENCE_TOPICS.find((t) => t.topic === topic);
  if (!def) {
    throw new Error(`Unknown investor intelligence topic: ${topic}`);
  }

  const response = await generateAIText({
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    userPrompt: def.researchPrompt,
    useWebSearch: true,
    maxOutputTokens: 2048,
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ai_investor_intelligence_bank")
    .upsert(
      {
        topic: def.topic,
        title: def.title,
        content: response.text,
        researched_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "topic" },
    );
  if (error) throw new Error(`Failed to save investor intelligence topic ${topic}: ${error.message}`);

  return { topic, contentLength: response.text.length };
}

/**
 * Every ai_investor_intelligence_bank row, joined into one text block for
 * the Sales Teaching Engine's weekly-briefing prompt (sales-teaching.ts).
 * Called once a week (not per-chat-message like getKnowledgeBankContext),
 * so no in-memory cache is needed here. Empty string if the bank hasn't
 * been populated yet or is unreadable -- callers append conditionally.
 */
export async function getInvestorIntelligenceContext(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ai_investor_intelligence_bank").select("title, content, researched_at").order("topic");
  if (error || !data || data.length === 0) return "";

  return data
    .map((row) => `### ${row.title} (riset terakhir: ${new Date(row.researched_at).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" })})\n${row.content}`)
    .join("\n\n");
}

export function isKnownInvestorIntelligenceTopic(topic: string): boolean {
  return TOPIC_NAMES.includes(topic);
}
