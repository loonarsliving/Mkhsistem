import "server-only";

import { askAI } from "../service";
import { getCashflowIntelligenceContext } from "./cashflow-intelligence";

const SYSTEM_PROMPT = `Anda adalah AI Cashflow Teaching Engine untuk PT Maha Karya Haluoleo, menulis untuk Kepala Cabang Jogja (Loonars Living, villa leasehold) saat saldo kas operasional cabang turun di bawah batas minimum yang ditetapkan perusahaan.

Tugas Anda BUKAN sekadar memberi peringatan -- Anda WAJIB memberi arahan operasional yang jelas, terukur, dan bisa langsung dijalankan Kepala Cabang. Anda punya wawasan tentang manajemen cashflow dan crisis management (disediakan sebagai konteks riset di bawah) -- evaluasi dulu relevansinya terhadap angka cabang yang diberikan sebelum dipakai, jangan tempel mentah-mentah.

Jawab dalam Bahasa Indonesia, format pesan WhatsApp dengan PERSIS bagian bernomor berikut (gunakan judul ini apa adanya):
1. PENYEBAB UTAMA (identifikasi penyebab paling mungkin berdasarkan data yang diberikan)
2. TINGKAT RISIKO (Rendah/Sedang/Tinggi, dengan alasan singkat)
3. REKOMENDASI DARI KNOWLEDGE BANK (ringkas, paling relevan untuk situasi ini)
4. ACTION PLAN:
   a. Prioritas penjualan yang harus dikejar
   b. Aktivitas yang harus dipercepat
   c. Pengeluaran yang perlu ditunda
   d. Fokus operasional yang harus diubah
   e. Risiko yang harus dihindari
   f. Target pemulihan cashflow (dengan estimasi jangka waktu)

Setiap bagian singkat dan konkret. Gunakan HANYA angka/data yang diberikan di prompt -- jangan mengarang angka. Nada mendesak dan profesional, bukan menakut-nakuti.`;

export interface CashflowActionPlanInput {
  branchName: string;
  saldo: number;
  thresholdAmount: number;
  dayOfMonth: number;
  activeVillaProspectCount: number;
  closings30d: number;
  recentBalanceAlertCount14d: number;
}

/** One Gemini call producing the root-cause + risk-level + Action Plan message for Kepala Cabang -- grounded in the Cashflow Intelligence knowledge bank (0127) plus real branch numbers. Delivered via WhatsApp only (see processCashflowActionPlan, process-job/route.ts). */
export async function generateCashflowActionPlan(input: CashflowActionPlanInput): Promise<string> {
  const cashflowContext = await getCashflowIntelligenceContext();

  const deficit = input.thresholdAmount - input.saldo;
  const userPrompt = `Cabang: ${input.branchName} (villa leasehold)
Saldo kas operasional saat ini: Rp ${input.saldo.toLocaleString("id-ID")}
Batas minimum perusahaan: Rp ${input.thresholdAmount.toLocaleString("id-ID")}
Kekurangan dari batas minimum: Rp ${deficit.toLocaleString("id-ID")}
Hari ini tanggal ke-${input.dayOfMonth} bulan berjalan.
Prospek villa leasehold aktif saat ini: ${input.activeVillaProspectCount}
Closing 30 hari terakhir: ${input.closings30d}
Jumlah peringatan saldo rendah dalam 14 hari terakhir: ${input.recentBalanceAlertCount14d}

Susun Action Plan untuk Kepala Cabang ${input.branchName} berdasarkan data di atas.${
    cashflowContext ? `\n\n---\nPENGETAHUAN RISET CASHFLOW & CRISIS MANAGEMENT (referensi tambahan, evaluasi relevansinya dulu):\n${cashflowContext}` : ""
  }`;

  return askAI(SYSTEM_PROMPT, userPrompt, { temperature: 0.6, maxOutputTokens: 1400 });
}
