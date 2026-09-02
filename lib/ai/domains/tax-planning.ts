import "server-only";

import type { TaxComputationResult } from "@/lib/tax-planning/calculator";

import { askAI } from "../service";

/**
 * Tax Planning's only AI call: turn an already-fully-computed
 * TaxComputationResult into one readable Indonesian narrative for a
 * non-accountant reader (Direktur/Finance). The model is never asked to
 * compute, estimate, or invent a single rupiah figure -- every number in
 * the prompt below is already final, produced by
 * lib/tax-planning/calculator.ts, same "Jangan mengarang angka" convention
 * every other AI domain helper in this codebase follows (see
 * lib/ai/domains/finance.ts). The model's only job is explanation and
 * plain-language framing of numbers it is handed, not deciding what those
 * numbers are or which strategies apply -- calculator.ts already decided
 * that deterministically (see its `proposals` array).
 */

const SYSTEM_PROMPT = `Anda adalah asisten AI Tax Planning untuk PT Maha Karya Haluoleo, perusahaan pengembang properti.
Tugas Anda: menulis satu ringkasan naratif dalam Bahasa Indonesia yang menjelaskan hasil ESTIMASI PPh Badan yang sudah dihitung oleh sistem (bukan oleh Anda) kepada Direktur/Finance yang bukan akuntan.

ATURAN KETAT:
- Jangan mengarang angka. Gunakan HANYA angka yang diberikan di prompt -- jangan menghitung ulang, membulatkan secara berbeda, atau mengestimasi angka baru.
- Jangan mengklaim ini adalah nasihat pajak resmi atau final. Ini adalah alat bantu perencanaan untuk didiskusikan lebih lanjut dengan konsultan pajak/akuntan berlisensi sebelum dipakai untuk pelaporan SPT.
- Jangan menyarankan tindakan di luar daftar peluang (proposals) yang diberikan -- jangan mengarang strategi pajak baru.
- Fokus ke: (1) apa yang paling penting dari hasil perhitungan ini, (2) mengapa penting (terutama jika ada potensi penghematan dibanding perhitungan flat biasa), (3) apa langkah berikutnya yang masuk akal.
- Nada: jelas, langsung ke inti, profesional, tidak menakut-nakuti maupun terlalu meyakinkan -- ini estimasi yang perlu direview manusia.
- Bahasa Indonesia, maksimal 220 kata.`;

function formatIdr(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

export async function generateTaxPlanningNarrative(result: TaxComputationResult): Promise<string> {
  const userPrompt = `Periode: ${result.periodStart} s.d. ${result.periodEnd}

Pendapatan final (penjualan rumah, PPh Final Ps.4(2) 2,5%): ${formatIdr(result.finalRevenueGrossIdr)}
Estimasi PPh Final atas pendapatan ini: ${formatIdr(result.finalTaxLiabilityIdr)}

Pendapatan non-final: ${formatIdr(result.nonFinalRevenueIdr)}
Beban operasional (opex): ${formatIdr(result.opexIdr)}
Penghasilan kena pajak non-final sebelum kompensasi rugi: ${formatIdr(result.taxableIncomeNonFinalBeforeLossIdr)}
Kompensasi rugi fiskal terpakai: ${formatIdr(result.lossCarryforwardAppliedIdr)}
Penghasilan kena pajak non-final final: ${formatIdr(result.taxableIncomeNonFinalIdr)}
Rugi fiskal baru periode ini (jika ada, untuk dikompensasi ke depan): ${formatIdr(result.newFiscalLossIdr)}

Skema direkomendasikan untuk penghasilan non-final: ${result.recommendedNonFinalRegime === "umkm_final" ? "PP 55/2022 final 0,5%" : result.recommendedNonFinalRegime === "31e" ? "normal + fasilitas Pasal 31E" : "tidak ada pajak terutang"}
Estimasi pajak non-final terpilih: ${formatIdr(result.nonFinalTaxLiabilityIdr)}

TOTAL estimasi pajak (final + non-final): ${formatIdr(result.totalEstimatedTaxIdr)}
Perbandingan: jika dihitung flat 22% atas seluruh laba sebelum pajak tanpa pemisahan final/non-final: ${formatIdr(result.naiveFlatTaxIdr)}
Estimasi potensi penghematan dari pemisahan yang benar: ${formatIdr(result.estimatedSavingsVsNaiveIdr)}

Daftar peluang/temuan (sudah final, jangan ditambah):
${result.proposals.map((p, i) => `${i + 1}. [${p.key}] ${p.title} -- ${p.description}`).join("\n")}

${result.unclassifiedAccountCodes.length > 0 ? `Catatan: ${result.unclassifiedAccountCodes.length} kode akun tidak dikenali dan dikecualikan dari perhitungan di atas.` : ""}

Tulis ringkasan naratifnya sekarang.`;

  return askAI(SYSTEM_PROMPT, userPrompt, { temperature: 0.3, maxOutputTokens: 500 });
}
