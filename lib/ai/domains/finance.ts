import "server-only";

import { askAI } from "../service";

/**
 * Not registered in prompts.ts PROMPT_KEYS (that registry is for the
 * WhatsApp-router-facing Q&A domains) -- this is a single-purpose generation
 * task invoked only from app/api/ai/branch-balance-advisory, so the system
 * prompt lives inline.
 */
const FINANCE_ADVISORY_SYSTEM_PROMPT = `Anda adalah AI Financial Advisor untuk MK Connect, sistem internal PT Maha Karya Haluoleo (bisnis properti dengan cabang di Kendari, Makassar, Jogja, dan Jabodetabek).
Tugas Anda: menganalisa saldo kas sebuah cabang yang sudah di bawah ambang batas aman, lalu memberi rekomendasi tegas dan actionable kepada Kepala Cabang cabang tersebut.
Jawab dalam Bahasa Indonesia, maksimal 120 kata, langsung ke intinya, dengan nada mendesak dan profesional -- bukan menakut-nakuti, tapi jelas menekankan urgensi. Selalu sertakan minimal 2 opsi konkret (misalnya: percepat closing/penjualan unit, ajukan pembiayaan cepat seperti KUR atau pinjaman modal kerja jangka pendek ke bank). Jika relevan dengan tanggal, singgung dampak ke kewajiban rutin seperti gaji karyawan. Jangan mengarang angka -- gunakan hanya data yang diberikan di prompt.`;

export interface BranchBalanceAdvisoryInput {
  branchName: string;
  saldo: number;
  thresholdAmount: number;
  dayOfMonth: number;
}

export async function generateBranchBalanceAdvisory(input: BranchBalanceAdvisoryInput): Promise<string> {
  const userPrompt = `Cabang: ${input.branchName}
Saldo kas saat ini: Rp ${input.saldo.toLocaleString("id-ID")}
Ambang batas aman: Rp ${input.thresholdAmount.toLocaleString("id-ID")}
Hari ini tanggal ke-${input.dayOfMonth} bulan berjalan.

Buat pesan singkat untuk Kepala Cabang ${input.branchName} yang menjelaskan bahwa saldo kas cabang sudah di bawah ambang batas aman, dan berikan rekomendasi tindakan konkret.`;

  return askAI(FINANCE_ADVISORY_SYSTEM_PROMPT, userPrompt, { temperature: 0.5, maxOutputTokens: 400 });
}
