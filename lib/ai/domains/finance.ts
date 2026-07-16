import "server-only";

import { askAI } from "../service";

/**
 * Not registered in prompts.ts PROMPT_KEYS (that registry is for the
 * WhatsApp-router-facing Q&A domains) -- this is a single-purpose generation
 * task invoked only from app/api/ai/branch-balance-advisory, so the system
 * prompt lives inline.
 */
const FINANCE_ADVISORY_SYSTEM_PROMPT = `Anda adalah AI Financial Advisor untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti dengan cabang di Kendari, Makassar, Jogja, dan Jabodetabek).
Tugas Anda: menganalisa saldo kas sebuah cabang yang sudah di bawah ambang batas (biaya gaji + operasional bulanan cabang tersebut), lalu memberi rekomendasi yang benar-benar logis dan spesifik untuk situasi itu -- bukan template tetap.
Pertimbangkan secara nyata: seberapa besar kekurangannya dibanding ambang batas, sudah tanggal berapa bulan berjalan (apakah tanggal gajian sudah dekat), dan berikan opsi yang paling masuk akal untuk kondisi itu. Opsi bisa mencakup (pilih yang relevan, jangan asal cantumkan semua): percepat closing/penjualan unit yang sudah dalam proses nego, tagih piutang/DP yang belum lunas, pembiayaan jangka pendek (KUR, pinjaman modal kerja bank, atau pinjaman antar-proyek internal jika cabang lain surplus), atau efisiensi/penundaan pengeluaran non-mendesak. KUR dan percepat penjualan hanyalah dua contoh dari opsi yang mungkin -- jangan selalu menyebut keduanya jika ada opsi lain yang lebih relevan dengan angka yang diberikan.
Jawab dalam Bahasa Indonesia, maksimal 120 kata, langsung ke intinya, dengan nada mendesak dan profesional -- bukan menakut-nakuti, tapi jelas menekankan urgensi berdasarkan angka yang ada. Sertakan minimal 2 rekomendasi konkret yang relevan dengan situasi. Jangan mengarang angka -- gunakan hanya data yang diberikan di prompt.`;

export interface BranchBalanceAdvisoryInput {
  branchName: string;
  saldo: number;
  thresholdAmount: number;
  dayOfMonth: number;
}

export async function generateBranchBalanceAdvisory(input: BranchBalanceAdvisoryInput): Promise<string> {
  const deficit = input.thresholdAmount - input.saldo;
  const userPrompt = `Cabang: ${input.branchName}
Saldo kas saat ini: Rp ${input.saldo.toLocaleString("id-ID")}
Ambang batas (biaya gaji + operasional bulanan cabang ini): Rp ${input.thresholdAmount.toLocaleString("id-ID")}
Kekurangan dari ambang batas: Rp ${deficit.toLocaleString("id-ID")}
Hari ini tanggal ke-${input.dayOfMonth} bulan berjalan.

Buat pesan singkat untuk Kepala Cabang ${input.branchName} yang menjelaskan bahwa saldo kas cabang sudah di bawah ambang batas, dan berikan rekomendasi tindakan konkret yang logis untuk angka dan situasi ini.`;

  return askAI(FINANCE_ADVISORY_SYSTEM_PROMPT, userPrompt, { temperature: 0.6, maxOutputTokens: 400 });
}
