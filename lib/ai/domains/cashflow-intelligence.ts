import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { generateAIText } from "../service";

/**
 * Cashflow Intelligence knowledge bank (0127) -- distilled cashflow/crisis-
 * management knowledge, refreshed weekly via Gemini + Google Search
 * grounding. Feeds the Cashflow Teaching Engine's low-balance Action Plan
 * (cashflow-teaching.ts) -- never a chat system prompt, never read by any
 * UI.
 */
export const CASHFLOW_INTELLIGENCE_TOPICS = [
  {
    topic: "cashflow_management_strategy",
    title: "Strategi Manajemen Cashflow Perusahaan Properti",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi manajemen cashflow untuk bisnis properti/developer skala kecil-menengah di Indonesia: proyeksi kas jangka pendek, pengelolaan jeda antara pengeluaran proyek dan penerimaan penjualan/cicilan, dan praktik umum menjaga likuiditas operasional cabang tetap sehat.",
  },
  {
    topic: "financial_crisis_management",
    title: "Crisis Management Keuangan untuk Bisnis Kecil-Menengah",
    researchPrompt:
      "Riset temuan TERBARU tentang crisis management keuangan untuk bisnis kecil-menengah yang menghadapi tekanan kas: langkah darurat jangka pendek yang lazim diambil, cara memprioritaskan tindakan saat kas sangat terbatas, dan kesalahan umum yang memperparah krisis kas alih-alih menyelesaikannya.",
  },
  {
    topic: "burn_rate_control",
    title: "Burn Rate Control",
    researchPrompt:
      "Riset temuan TERBARU tentang cara mengontrol burn rate (kecepatan menghabiskan kas) pada bisnis kecil-menengah: cara mengidentifikasi pos pengeluaran yang paling menguras kas, metrik sederhana untuk memonitor burn rate operasional cabang, dan taktik menurunkan burn rate tanpa mematikan operasional inti.",
  },
  {
    topic: "cost_efficiency_strategy",
    title: "Strategi Efisiensi Biaya Operasional",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi efisiensi biaya operasional untuk cabang bisnis properti/penjualan: pengeluaran yang paling aman dipangkas/ditunda tanpa mengganggu operasional inti (penjualan tetap jalan), pengeluaran yang justru tidak boleh dipangkas karena berisiko menghambat pemasukan, dan cara membedakan keduanya.",
  },
  {
    topic: "payment_priority_strategy",
    title: "Strategi Prioritas Pembayaran Saat Kas Terbatas",
    researchPrompt:
      "Riset temuan TERBARU tentang cara menentukan prioritas pembayaran saat kas perusahaan terbatas: urutan kewajiban yang lazim diprioritaskan (gaji karyawan, kewajiban legal/pajak, vendor kritis, vs pengeluaran yang bisa ditunda), dan cara berkomunikasi dengan pihak yang pembayarannya ditunda agar hubungan tetap terjaga.",
  },
  {
    topic: "cash_management_practice",
    title: "Praktik Pengelolaan Kas Harian",
    researchPrompt:
      "Riset temuan TERBARU tentang praktik pengelolaan kas harian/mingguan yang baik untuk cabang bisnis kecil-menengah: pencatatan arus kas sederhana yang efektif, cadangan kas minimum yang disarankan, dan kebiasaan pengelolaan kas yang membedakan bisnis yang sehat vs yang sering krisis kas.",
  },
  {
    topic: "revenue_growth_strategy",
    title: "Strategi Meningkatkan Pemasukan Saat Kas Tertekan",
    researchPrompt:
      "Riset temuan TERBARU tentang strategi meningkatkan pemasukan dengan cepat saat kas perusahaan tertekan, khusus untuk bisnis penjualan properti/investasi: taktik mempercepat closing yang sudah dalam proses nego, program insentif jangka pendek untuk mendorong penjualan, dan cara menagih piutang/DP yang belum lunas secara efektif.",
  },
  {
    topic: "operational_continuity_low_cash",
    title: "Mempertahankan Operasional Saat Kas Terbatas",
    researchPrompt:
      "Riset temuan TERBARU tentang cara mempertahankan operasional bisnis tetap berjalan saat kas sangat terbatas: fokus operasional yang paling penting dipertahankan (penjualan dan layanan ke pelanggan), aktivitas yang bisa disederhanakan sementara, dan cara menjaga moral tim tetap baik selama masa penghematan.",
  },
  {
    topic: "cash_crisis_resilience_best_practice",
    title: "Best Practice Perusahaan yang Berhasil Bertahan dari Tekanan Kas",
    researchPrompt:
      "Riset temuan TERBARU (studi kasus nyata jika ada) tentang perusahaan/bisnis kecil-menengah yang berhasil bertahan dan pulih dari tekanan keuangan: tindakan konkret yang mereka ambil, pola pengambilan keputusan yang terbukti efektif, dan pelajaran yang bisa diterapkan oleh cabang bisnis properti yang sedang mengalami tekanan kas serupa.",
  },
] as const;

export type CashflowIntelligenceTopic = (typeof CASHFLOW_INTELLIGENCE_TOPICS)[number]["topic"];

const TOPIC_NAMES: readonly string[] = CASHFLOW_INTELLIGENCE_TOPICS.map((t) => t.topic);

const RESEARCH_SYSTEM_PROMPT = `Anda adalah analis keuangan & manajemen krisis kas untuk bisnis properti kecil-menengah di Indonesia. Rangkum temuan riset Anda secara padat, konkret, dan actionable dalam Bahasa Indonesia -- poin-poin yang benar-benar bisa langsung dipakai untuk membimbing Kepala Cabang saat kas cabang tertekan, bukan teori umum atau basa-basi.

Format jawaban dengan sub-header dari kategori berikut, HANYA yang benar-benar relevan untuk topik ini (jangan paksakan semua kategori pada setiap topik): POLA (pattern yang ditemukan), SOP (urutan tindakan baku), BEST PRACTICE, CHECKLIST (langkah konkret). Sekitar 400-600 kata.`;

/** One Gemini + Google Search grounding call per topic, upserted into ai_cashflow_intelligence_bank -- called by the cashflow_intelligence_refresh job (process-job/route.ts). */
export async function processCashflowIntelligenceRefreshJob(topic: string): Promise<{ topic: string; contentLength: number }> {
  const def = CASHFLOW_INTELLIGENCE_TOPICS.find((t) => t.topic === topic);
  if (!def) {
    throw new Error(`Unknown cashflow intelligence topic: ${topic}`);
  }

  const response = await generateAIText({
    systemPrompt: RESEARCH_SYSTEM_PROMPT,
    userPrompt: def.researchPrompt,
    useWebSearch: true,
    maxOutputTokens: 2048,
  });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("ai_cashflow_intelligence_bank")
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
  if (error) throw new Error(`Failed to save cashflow intelligence topic ${topic}: ${error.message}`);

  return { topic, contentLength: response.text.length };
}

/**
 * Every ai_cashflow_intelligence_bank row, joined into one text block for
 * the Cashflow Teaching Engine's Action Plan prompt (cashflow-teaching.ts).
 * Called only when a branch actually crosses its threshold, so no
 * in-memory cache is needed here. Empty string if the bank hasn't been
 * populated yet or is unreadable -- callers append conditionally.
 */
export async function getCashflowIntelligenceContext(): Promise<string> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("ai_cashflow_intelligence_bank").select("title, content, researched_at").order("topic");
  if (error || !data || data.length === 0) return "";

  return data
    .map((row) => `### ${row.title} (riset terakhir: ${new Date(row.researched_at).toLocaleDateString("id-ID", { timeZone: "Asia/Makassar" })})\n${row.content}`)
    .join("\n\n");
}

export function isKnownCashflowIntelligenceTopic(topic: string): boolean {
  return TOPIC_NAMES.includes(topic);
}
