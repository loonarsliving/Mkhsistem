import "server-only";

import { askAI } from "../service";

/**
 * Not registered in prompts.ts PROMPT_KEYS (that registry is for the
 * WhatsApp-router-facing Q&A domains) -- these are single-purpose generation
 * tasks invoked only from app/api/ai/branch-balance-advisory, so the system
 * prompts live inline. Three situations, three different framings -- a
 * branch with no project yet isn't a cash crisis, and a branch with no
 * sales yet needs a soft nudge to Direktur Operasional, not a KUR pitch.
 */

const CASH_LOW_SYSTEM_PROMPT = `Anda adalah LEON, COO Virtual PT Maha Karya Haluoleo (bisnis properti dengan cabang di Kendari, Makassar, Jogja, dan Jabodetabek).
Tugas Anda: menganalisa saldo kas sebuah cabang yang sudah di bawah ambang batas (biaya gaji + operasional bulanan cabang tersebut), lalu memberi rekomendasi yang benar-benar logis dan spesifik untuk situasi itu -- bukan template tetap.
Pertimbangkan secara nyata: seberapa besar kekurangannya dibanding ambang batas, sudah tanggal berapa bulan berjalan (apakah tanggal gajian sudah dekat), dan berikan opsi yang paling masuk akal untuk kondisi itu. Opsi bisa mencakup (pilih yang relevan, jangan asal cantumkan semua): percepat closing/penjualan unit yang sudah dalam proses nego, tagih piutang/DP yang belum lunas, pembiayaan jangka pendek (KUR, pinjaman modal kerja bank, atau pinjaman antar-proyek internal jika cabang lain surplus), atau efisiensi/penundaan pengeluaran non-mendesak. KUR dan percepat penjualan hanyalah dua contoh dari opsi yang mungkin -- jangan selalu menyebut keduanya jika ada opsi lain yang lebih relevan dengan angka yang diberikan.
Jawab dalam Bahasa Indonesia, maksimal 120 kata, langsung ke intinya, dengan nada mendesak dan profesional -- bukan menakut-nakuti, tapi jelas menekankan urgensi berdasarkan angka yang ada. Sertakan minimal 2 rekomendasi konkret yang relevan dengan situasi. Jangan mengarang angka -- gunakan hanya data yang diberikan di prompt.`;

const NO_PROJECT_SYSTEM_PROMPT = `Anda adalah LEON, COO Virtual PT Maha Karya Haluoleo. Cabang yang dituju BELUM memiliki proyek properti yang dibuka -- ini bukan krisis kas, jadi jangan bahas saldo/KUR/pembiayaan.
Tugas Anda: menulis pesan pengingat singkat ke Kepala Cabang agar segera membuka/memulai proyek di cabangnya, dan sampaikan bahwa kantor pusat akan berupaya membantu mencarikan pendanaan begitu proyek mulai berjalan.
Nada mendukung dan memotivasi, bukan menekan atau menyalahkan -- ini pengingat rutin, bukan teguran. PENTING: setiap kali dipanggil, gunakan kalimat pembuka dan susunan kata yang BERBEDA dari kebiasaan sebelumnya (jangan terdengar seperti template yang sama berulang-ulang) -- variasikan gaya bahasa, urutan poin, dan contoh kalimat.
Jawab dalam Bahasa Indonesia, maksimal 100 kata. Jangan mengarang detail (nama proyek, angka) yang tidak diberikan di prompt.`;

const NO_SALES_SYSTEM_PROMPT = `Anda adalah LEON, COO Virtual PT Maha Karya Haluoleo, menulis untuk Direktur Operasional. Cabang yang dituju sudah punya proyek berjalan namun belum ada penjualan/closing sejak dibuka.
Tugas Anda: menulis pesan singkat yang mengingatkan situasi ini dengan nada HALUS dan suportif -- tidak menuduh, tidak terkesan menyalahkan kepala cabang atau tim sales -- namun tetap jelas mendorong agar percepatan penjualan/closing di cabang ini menjadi perhatian/prioritas, misalnya dengan menyarankan Direktur Operasional turut memantau atau memberi dukungan tambahan ke tim sales/markom cabang tersebut.
PENTING: variasikan kalimat dan gaya setiap kali dipanggil, jangan terdengar seperti template yang sama berulang-ulang.
Jawab dalam Bahasa Indonesia, maksimal 110 kata. Jangan mengarang angka atau detail yang tidak diberikan di prompt.`;

export type BranchSituationType = "cash_low" | "no_project" | "no_sales";

export interface BranchAdvisoryInput {
  situationType: BranchSituationType;
  branchName: string;
  saldo: number;
  thresholdAmount: number;
  dayOfMonth: number;
  situationNote?: string | null;
}

export async function generateBranchAdvisory(input: BranchAdvisoryInput): Promise<string> {
  if (input.situationType === "no_project") {
    const userPrompt = `Cabang: ${input.branchName}
${input.situationNote ?? "Cabang ini belum memiliki proyek yang dibuka."}
Hari ini tanggal ke-${input.dayOfMonth} bulan berjalan.

Buat pesan pengingat untuk Kepala Cabang ${input.branchName}.`;
    return askAI(NO_PROJECT_SYSTEM_PROMPT, userPrompt, { temperature: 0.8, maxOutputTokens: 350 });
  }

  if (input.situationType === "no_sales") {
    const userPrompt = `Cabang: ${input.branchName}
${input.situationNote ?? "Proyek sudah berjalan namun belum ada penjualan/closing sejak dibuka."}
Saldo kas cabang saat ini: Rp ${input.saldo.toLocaleString("id-ID")}
Hari ini tanggal ke-${input.dayOfMonth} bulan berjalan.

Buat pesan untuk Direktur Operasional tentang cabang ${input.branchName}.`;
    return askAI(NO_SALES_SYSTEM_PROMPT, userPrompt, { temperature: 0.7, maxOutputTokens: 380 });
  }

  const deficit = input.thresholdAmount - input.saldo;
  const userPrompt = `Cabang: ${input.branchName}
Saldo kas saat ini: Rp ${input.saldo.toLocaleString("id-ID")}
Ambang batas (biaya gaji + operasional bulanan cabang ini): Rp ${input.thresholdAmount.toLocaleString("id-ID")}
Kekurangan dari ambang batas: Rp ${deficit.toLocaleString("id-ID")}
Hari ini tanggal ke-${input.dayOfMonth} bulan berjalan.

Buat pesan singkat untuk Kepala Cabang ${input.branchName} yang menjelaskan bahwa saldo kas cabang sudah di bawah ambang batas, dan berikan rekomendasi tindakan konkret yang logis untuk angka dan situasi ini.`;

  return askAI(CASH_LOW_SYSTEM_PROMPT, userPrompt, { temperature: 0.6, maxOutputTokens: 400 });
}
