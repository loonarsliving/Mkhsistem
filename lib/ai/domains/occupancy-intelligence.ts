import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

/**
 * Occupancy Intelligence knowledge bank -- distilled property-management
 * business knowledge for Management Property (kos/villa rental management
 * on behalf of owners, not a sales product like Loonars Living's villa
 * leasehold): how to raise occupancy, how to win over property owners to
 * hand over management, and tourism-market data starting from Jogja.
 * Refreshed weekly via Gemini + Google Search grounding. Feeds the
 * Occupancy Teaching Engine's Wed/Fri briefing (occupancy-teaching.ts) --
 * never a chat system prompt, never read by any UI. Same shape as
 * ai_investor_intelligence_bank/ai_cashflow_intelligence_bank.
 */
export const OCCUPANCY_INTELLIGENCE_TOPICS = [
  {
    topic: "occupancy_improvement_tactics",
    title: "Taktik Meningkatkan Okupansi Kos/Properti Sewa",
    researchPrompt:
      "Riset temuan TERBARU tentang taktik konkret meningkatkan okupansi kos/kontrakan/properti sewa jangka pendek-menengah di Indonesia: strategi marketing digital (listing di OTA/marketplace kos, iklan lokal), penempatan harga yang kompetitif, promo/referral untuk penghuni baru, perbaikan fasilitas yang paling berdampak pada okupansi, dan cara menganalisis kenapa unit tertentu kosong lama lalu memperbaikinya.",
  },
  {
    topic: "property_owner_acquisition_deal",
    title: "Cara Deal dengan Pemilik Properti agar Jadi Pengelolanya",
    researchPrompt:
      "Riset temuan TERBARU tentang cara perusahaan manajemen properti (property management company) meyakinkan pemilik kos/kontrakan/villa untuk mempercayakan pengelolaan propertinya: skema bagi hasil/komisi yang umum di industri ini, cara pitch nilai tambah (marketing, perawatan, urus penyewa, laporan keuangan transparan) dibanding pemilik urus sendiri, keberatan umum pemilik properti (takut kehilangan kontrol, takut biaya tersembunyi, trauma pengelola sebelumnya) dan cara menjawabnya, serta dokumen/kontrak kunci yang biasa dipakai dalam kesepakatan ini.",
  },
  {
    topic: "tourism_city_market_data",
    title: "Data Pasar Kota Wisata Indonesia untuk Properti Sewa",
    researchPrompt:
      "Riset temuan TERBARU tentang data pasar properti sewa jangka pendek/menengah (kos, guesthouse, villa) di kota-kota wisata utama Indonesia: tren permintaan wisatawan domestik vs asing, musim ramai/sepi, kisaran harga sewa per kota, dan kota mana yang sedang tumbuh permintaannya untuk properti sewa/manajemen properti.",
  },
  {
    topic: "jogja_occupancy_market_deep_dive",
    title: "Breakdown Pasar Okupansi Properti di Jogja",
    researchPrompt:
      "Riset temuan TERBARU secara spesifik untuk Yogyakarta (Jogja): area/kecamatan mana yang paling diminati untuk kos/kontrakan/villa sewa (dekat kampus, area wisata, dekat bandara/stasiun), pola musiman wisatawan Jogja (liburan sekolah, musim mahasiswa baru, weekend), kisaran harga sewa kos/villa di Jogja saat ini, dan siapa kompetitor pengelola properti yang aktif di Jogja beserta model bisnis mereka.",
  },
  {
    topic: "guest_retention_and_reviews",
    title: "Retensi Penghuni/Tamu & Rating Ulasan",
    researchPrompt:
      "Riset temuan TERBARU tentang cara meningkatkan retensi penghuni kos/kontrakan dan rating ulasan properti sewa/guesthouse: pengalaman onboarding penghuni baru, respons cepat terhadap keluhan/perbaikan, program loyalitas untuk penghuni lama, dan cara mendapatkan ulasan positif secara organik di platform pencarian kos/OTA.",
  },
  {
    topic: "dynamic_pricing_revenue_management",
    title: "Dynamic Pricing & Revenue Management Properti Sewa",
    researchPrompt:
      "Riset temuan TERBARU tentang teknik dynamic pricing/revenue management untuk memaksimalkan okupansi sekaligus pendapatan properti sewa jangka pendek-menengah: kapan menurunkan harga vs mempertahankan harga saat okupansi rendah, strategi harga musiman, paket harga jangka panjang vs bulanan, dan kesalahan umum yang membuat properti sulit terisi meski sudah diturunkan harganya.",
  },
  {
    topic: "owner_relationship_management",
    title: "Menjaga Hubungan Jangka Panjang dengan Pemilik Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang cara menjaga hubungan jangka panjang dengan pemilik properti yang propertinya sudah dikelola: transparansi laporan keuangan/okupansi berkala, komunikasi proaktif saat ada masalah (bukan menunggu ditanya), cara menangani komplain pemilik tanpa kehilangan kepercayaan, dan strategi agar pemilik tidak pindah ke pengelola lain atau menarik propertinya.",
  },
] as const;

export type OccupancyIntelligenceTopic = (typeof OCCUPANCY_INTELLIGENCE_TOPICS)[number]["topic"];

const TOPIC_NAMES: readonly string[] = OCCUPANCY_INTELLIGENCE_TOPICS.map((t) => t.topic);

const RESEARCH_SYSTEM_PROMPT = `Anda adalah analis bisnis manajemen properti (property management) untuk sebuah perusahaan di Indonesia yang mengelola kos/kontrakan/villa ATAS NAMA PEMILIKNYA (bukan menjual unit properti) -- pendapatan perusahaan berasal dari okupansi tinggi dan kepercayaan pemilik properti. Rangkum temuan riset Anda secara padat, konkret, dan actionable dalam Bahasa Indonesia -- poin-poin yang benar-benar bisa langsung dipakai untuk membimbing Kepala Cabang Management Property, bukan teori umum atau basa-basi.

Format jawaban dengan sub-header dari kategori berikut, HANYA yang benar-benar relevan untuk topik ini (jangan paksakan semua kategori pada setiap topik): POLA (pattern yang ditemukan), CHECKLIST (langkah konkret), SOP (urutan tindakan baku), BEST PRACTICE, OBJEKSI UMUM & CARA MENJAWAB, DATA PASAR. Sekitar 400-600 kata.`;

/** One Gemini + Google Search grounding call per topic, upserted into ai_occupancy_intelligence_bank -- called by the occupancy_intelligence_refresh job (process-job/route.ts). */
export async function processOccupancyIntelligenceRefreshJob(topic: string): Promise<{ topic: string; contentLength: number }> {
  const def = OCCUPANCY_INTELLIGENCE_TOPICS.find((t) => t.topic === topic);
  if (!def) {
    throw new Error(`Unknown occupancy intelligence topic: ${topic}`);
  }

  const response = await generateAIText({
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    userPrompt: def.researchPrompt,
    useWebSearch: true,
    maxOutputTokens: 2048,
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ai_occupancy_intelligence_bank")
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
  if (error) throw new Error(`Failed to save occupancy intelligence topic ${topic}: ${error.message}`);

  return { topic, contentLength: response.text.length };
}

/**
 * Every ai_occupancy_intelligence_bank row, joined into one text block for
 * the Occupancy Teaching Engine's Wed/Fri briefing prompt
 * (occupancy-teaching.ts). Empty string if the bank hasn't been populated
 * yet or is unreadable -- callers append conditionally.
 */
export async function getOccupancyIntelligenceContext(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ai_occupancy_intelligence_bank").select("title, content, researched_at").order("topic");
  if (error || !data || data.length === 0) return "";

  return data
    .map((row) => `### ${row.title} (riset terakhir: ${new Date(row.researched_at).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" })})\n${row.content}`)
    .join("\n\n");
}

export function isKnownOccupancyIntelligenceTopic(topic: string): boolean {
  return TOPIC_NAMES.includes(topic);
}
