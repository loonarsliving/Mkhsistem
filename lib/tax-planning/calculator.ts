import {
  COGS_CODES,
  FINAL_PP34_REVENUE_CODES,
  FIXED_ASSET_CODES,
  MKH_COA_LABELS,
  NON_FINAL_REVENUE_CODES,
  OPEX_CODES,
  OPEX_REVIEW_CODES,
  isUnclassifiedAccount,
} from "./mkh-properti-coa";
import type { MkhJurnalRow } from "./mkh-properti-client";

/**
 * Deterministic PPh Badan (corporate income tax) estimator for PT Maha Karya
 * Haluoleo, computed entirely in application code from mkh-properti's real
 * jurnal rows -- never by the AI model (see lib/ai/domains/tax-planning.ts,
 * which only narrates these numbers, same guardrail as
 * lib/ai/friday/signals.ts for FRIDAY).
 *
 * Core insight this module exists to surface: mkh-properti's own Laporan
 * Keuangan page (src/app/(app)/laporan-keuangan/page.tsx) lets a user type
 * ANY number into "Beban Pajak Penghasilan" against total laba sebelum
 * pajak, with no framework separating final-taxed revenue from normal
 * taxable income -- there is no PPh computation there at all today, just a
 * manual placeholder number. For a property developer, that gap matters a
 * lot: revenue from selling land & building (rumah) is subject to FINAL PPh
 * Pasal 4(2) under PP 34/2016 (2.5% of gross transfer value, 1% only for
 * verified RSH/subsidized units) and is excluded entirely from the normal
 * 22% PPh Badan base. A flat 22%/25% applied to the WHOLE pretax profit --
 * including already-final-taxed home-sale revenue -- double-taxes that
 * income and is a common, entirely avoidable overpayment.
 *
 * IMPORTANT LIMITS (surfaced to the user via `requiresProfessionalReview`,
 * never hidden): this is an ESTIMATE for planning discussion, not a filing.
 * It assumes COGS (5-xxxx) is attributable to the final-taxed project
 * revenue it was incurred for, not deductible a second time against normal
 * taxable income -- a simplification the ledger's flat structure doesn't let
 * this module verify transaction-by-transaction. RSH eligibility, prior
 * fiscal loss balances, and UMKM-facility eligibility years are NOT
 * derivable from the ledger and must be supplied via tax_planning_fiscal_config
 * (features/tax-planning/actions -- updateFiscalConfigAction).
 */

export const PPH_NORMAL_RATE = 0.22;
/** Pasal 31E UU PPh: 50% rate discount on the taxable-income slice proportional to turnover up to Rp4.8B, for taxpayers with annual gross turnover <= the configured threshold (default Rp50B). */
export const PPH_31E_DISCOUNTED_RATE = 0.11;
export const PPH_31E_TURNOVER_SLICE_IDR = 4_800_000_000;
export const DEFAULT_31E_TURNOVER_THRESHOLD_IDR = 50_000_000_000;
/** PP 55/2022 (formerly PP 23/2018) final tax on gross turnover for eligible small taxpayers, capped at 3 tax years for a PT. */
export const PP23_UMKM_FINAL_RATE = 0.005;
export const PP23_UMKM_TURNOVER_CEILING_IDR = 4_800_000_000;
export const PP23_UMKM_MAX_YEARS = 3;
/** PP 34/2016: final PPh Pasal 4(2) on gross land & building transfer value. 1% applies only to verified RSH (rumah sederhana bersubsidi) -- not distinguishable from the ledger, so this module always computes the conservative 2.5% and flags RSH review as a separate, non-quantified opportunity. */
export const PP34_FINAL_TAX_RATE = 0.025;

export interface FiscalConfig {
  fiscalLossCarryforwardIdr: number;
  umkmFinalTaxFirstEligibleYear: number | null;
  umkmFinalTaxYearsUsed: number;
  annualTurnoverThresholdIdr: number;
}

export interface TaxProposalCandidate {
  key:
    | "final_tax_reclassification"
    | "fiscal_loss_carryforward"
    | "regime_comparison_31e_umkm"
    | "unclassified_account_review"
    | "rsh_ppn_exemption_check"
    | "depreciation_method_review";
  title: string;
  description: string;
  estimatedImpactIdr: number | null;
  confidence: "tinggi" | "sedang" | "rendah";
  requiresProfessionalReview: boolean;
}

export interface TaxComputationResult {
  periodStart: string;
  periodEnd: string;

  finalRevenueGrossIdr: number;
  finalTaxLiabilityIdr: number;

  nonFinalRevenueIdr: number;
  cogsIdr: number;
  opexIdr: number;
  taxableIncomeNonFinalBeforeLossIdr: number;
  lossCarryforwardAppliedIdr: number;
  taxableIncomeNonFinalIdr: number;
  newFiscalLossIdr: number;

  estimatedTurnoverIdr: number;
  eligibleFor31E: boolean;
  regime31E: { taxIdr: number };
  eligibleForUmkmFinal: { eligible: boolean; reason: string; taxIdr: number | null };
  recommendedNonFinalRegime: "31e" | "umkm_final" | "none";
  nonFinalTaxLiabilityIdr: number;

  naiveFlatTaxIdr: number;
  totalEstimatedTaxIdr: number;
  estimatedSavingsVsNaiveIdr: number;

  unclassifiedAccountCodes: string[];
  fixedAssetBalanceIdr: number;
  opexReviewIdr: number;

  proposals: TaxProposalCandidate[];
}

function netCredit(rows: MkhJurnalRow[], codes: readonly string[]): number {
  return rows.filter((r) => codes.includes(r.akun)).reduce((sum, r) => sum + (r.k - r.d), 0);
}

function netDebit(rows: MkhJurnalRow[], codes: readonly string[]): number {
  return rows.filter((r) => codes.includes(r.akun)).reduce((sum, r) => sum + (r.d - r.k), 0);
}

const idr = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export function computeTaxPlanning(periodStart: string, periodEnd: string, jurnal: MkhJurnalRow[], config: FiscalConfig): TaxComputationResult {
  const finalRevenueGrossIdr = Math.max(0, netCredit(jurnal, FINAL_PP34_REVENUE_CODES));
  const finalTaxLiabilityIdr = finalRevenueGrossIdr * PP34_FINAL_TAX_RATE;

  const nonFinalRevenueIdr = Math.max(0, netCredit(jurnal, NON_FINAL_REVENUE_CODES));
  const cogsIdr = Math.max(0, netDebit(jurnal, COGS_CODES));
  const opexIdr = Math.max(0, netDebit(jurnal, OPEX_CODES));
  const opexReviewIdr = Math.max(0, netDebit(jurnal, OPEX_REVIEW_CODES));
  const fixedAssetBalanceIdr = Math.max(0, netDebit(jurnal, FIXED_ASSET_CODES));

  // COGS is assumed attributable to the final-taxed project revenue it funded,
  // so it is deliberately NOT subtracted from non-final taxable income here --
  // see the module doc comment above. Only opex (mostly HO overhead) offsets
  // the small non-final revenue stream.
  const taxableIncomeNonFinalBeforeLossIdr = nonFinalRevenueIdr - opexIdr;

  let lossCarryforwardAppliedIdr = 0;
  let taxableIncomeNonFinalIdr = 0;
  let newFiscalLossIdr = 0;

  if (taxableIncomeNonFinalBeforeLossIdr > 0) {
    lossCarryforwardAppliedIdr = Math.min(config.fiscalLossCarryforwardIdr, taxableIncomeNonFinalBeforeLossIdr);
    taxableIncomeNonFinalIdr = taxableIncomeNonFinalBeforeLossIdr - lossCarryforwardAppliedIdr;
  } else {
    newFiscalLossIdr = -taxableIncomeNonFinalBeforeLossIdr;
  }

  const estimatedTurnoverIdr = finalRevenueGrossIdr + nonFinalRevenueIdr;
  const eligibleFor31E = estimatedTurnoverIdr <= config.annualTurnoverThresholdIdr;

  let regime31ETaxIdr = 0;
  if (taxableIncomeNonFinalIdr > 0) {
    if (eligibleFor31E) {
      const discountedSlice = Math.min(taxableIncomeNonFinalIdr, PPH_31E_TURNOVER_SLICE_IDR);
      const normalSlice = taxableIncomeNonFinalIdr - discountedSlice;
      regime31ETaxIdr = discountedSlice * PPH_31E_DISCOUNTED_RATE + normalSlice * PPH_NORMAL_RATE;
    } else {
      regime31ETaxIdr = taxableIncomeNonFinalIdr * PPH_NORMAL_RATE;
    }
  }

  const umkmYearsRemaining = config.umkmFinalTaxFirstEligibleYear === null ? 0 : Math.max(0, PP23_UMKM_MAX_YEARS - config.umkmFinalTaxYearsUsed);
  const umkmEligible = umkmYearsRemaining > 0 && estimatedTurnoverIdr <= PP23_UMKM_TURNOVER_CEILING_IDR;
  const umkmReason = config.umkmFinalTaxFirstEligibleYear === null
    ? "Tahun pertama terdaftar sebagai wajib pajak PP 55/2022 belum diisi di Konfigurasi Fiskal -- tidak bisa memastikan sisa tahun fasilitas."
    : umkmYearsRemaining === 0
      ? "Batas 3 tahun pajak fasilitas PP 55/2022 sudah habis terpakai."
      : estimatedTurnoverIdr > PP23_UMKM_TURNOVER_CEILING_IDR
        ? `Total omzet periode ini (${idr(estimatedTurnoverIdr)}) melebihi ambang batas Rp4.8 miliar/tahun untuk PP 55/2022.`
        : `Berpotensi memenuhi syarat, sisa ${umkmYearsRemaining} tahun pajak dari fasilitas 3 tahun.`;
  const umkmTaxIdr = umkmEligible ? nonFinalRevenueIdr * PP23_UMKM_FINAL_RATE : null;

  let recommendedNonFinalRegime: TaxComputationResult["recommendedNonFinalRegime"] = "none";
  let nonFinalTaxLiabilityIdr = 0;
  if (taxableIncomeNonFinalBeforeLossIdr <= 0) {
    recommendedNonFinalRegime = "none";
    nonFinalTaxLiabilityIdr = 0;
  } else if (umkmEligible && umkmTaxIdr !== null && umkmTaxIdr < regime31ETaxIdr) {
    recommendedNonFinalRegime = "umkm_final";
    nonFinalTaxLiabilityIdr = umkmTaxIdr;
  } else {
    recommendedNonFinalRegime = "31e";
    nonFinalTaxLiabilityIdr = regime31ETaxIdr;
  }

  const totalEstimatedTaxIdr = finalTaxLiabilityIdr + nonFinalTaxLiabilityIdr;

  // What a naive "flat rate on total pretax profit, no final/non-final split"
  // calculation -- the failure mode mkh-properti's manual bebanPajak field
  // invites -- would produce, for comparison.
  const naiveTaxableBase = Math.max(0, finalRevenueGrossIdr + nonFinalRevenueIdr - cogsIdr - opexIdr);
  const naiveFlatTaxIdr = naiveTaxableBase * PPH_NORMAL_RATE;
  const estimatedSavingsVsNaiveIdr = Math.max(0, naiveFlatTaxIdr - totalEstimatedTaxIdr);

  const unclassifiedAccountCodes = Array.from(new Set(jurnal.map((r) => r.akun).filter((akun) => isUnclassifiedAccount(akun))));

  const proposals: TaxProposalCandidate[] = [];

  if (finalRevenueGrossIdr > 0) {
    proposals.push({
      key: "final_tax_reclassification",
      title: "Pisahkan pendapatan penjualan rumah sebagai objek PPh Final Pasal 4(2)",
      description:
        `Pendapatan penjualan rumah/uang muka periode ini (${idr(finalRevenueGrossIdr)}, akun ${MKH_COA_LABELS["4-1001"]} + ${MKH_COA_LABELS["4-1002"]}) ` +
        `adalah pengalihan hak atas tanah dan/atau bangunan -- dikenakan PPh Final Pasal 4(2) sebesar 2,5% dari nilai bruto pengalihan (PP 34/2016), ` +
        `dibayar terpisah dan TIDAK digabung ke penghasilan kena pajak PPh Badan normal. Estimasi PPh Final: ${idr(finalTaxLiabilityIdr)}. ` +
        `Jika laporan saat ini menghitung pajak dengan tarif flat 22%/25% atas seluruh laba sebelum pajak (termasuk pendapatan ini), ` +
        `berpotensi membayar pajak dua kali lipat untuk pendapatan yang sama.`,
      estimatedImpactIdr: estimatedSavingsVsNaiveIdr > 0 ? estimatedSavingsVsNaiveIdr : null,
      confidence: "tinggi",
      requiresProfessionalReview: true,
    });
  }

  if (taxableIncomeNonFinalBeforeLossIdr > 0) {
    proposals.push({
      key: "regime_comparison_31e_umkm",
      title: "Bandingkan skema Pasal 31E vs PP 55/2022 untuk penghasilan non-final",
      description:
        `Penghasilan kena pajak non-final periode ini (di luar penjualan rumah) diperkirakan ${idr(taxableIncomeNonFinalIdr)}. ` +
        `Skema normal + fasilitas Pasal 31E (diskon tarif 50% untuk Rp4,8 miliar pertama dari peredaran bruto, ` +
        `berlaku jika omzet setahun ≤ ${idr(config.annualTurnoverThresholdIdr)}): estimasi pajak ${idr(regime31ETaxIdr)}. ` +
        `Skema final PP 55/2022 (0,5% dari omzet bruto, maksimal 3 tahun pajak untuk badan usaha): ${umkmEligible && umkmTaxIdr !== null ? idr(umkmTaxIdr) : "tidak berlaku"} -- ${umkmReason} ` +
        `Skema yang lebih murah secara legal: ${recommendedNonFinalRegime === "umkm_final" ? "PP 55/2022 (final 0,5%)" : recommendedNonFinalRegime === "31e" ? "normal + Pasal 31E" : "tidak ada pajak terutang"}.`,
      estimatedImpactIdr: umkmEligible && umkmTaxIdr !== null ? Math.max(0, regime31ETaxIdr - umkmTaxIdr) : null,
      confidence: "sedang",
      requiresProfessionalReview: true,
    });
  }

  if (newFiscalLossIdr > 0) {
    proposals.push({
      key: "fiscal_loss_carryforward",
      title: "Catat rugi fiskal periode ini untuk kompensasi 5 tahun ke depan",
      description:
        `Penghasilan non-final periode ini lebih kecil dari beban operasional (overhead kantor pusat), menghasilkan rugi fiskal ` +
        `sekitar ${idr(newFiscalLossIdr)} pada aliran penghasilan non-final. Berdasarkan UU PPh, rugi fiskal dapat dikompensasikan ` +
        `terhadap penghasilan kena pajak non-final pada periode-periode berikutnya, maksimal 5 tahun pajak. Simpan nilai ini di ` +
        `Konfigurasi Fiskal setelah periode ditutup agar bisa dipakai mengurangi pajak periode mendatang.`,
      estimatedImpactIdr: null,
      confidence: "sedang",
      requiresProfessionalReview: true,
    });
  }

  if (unclassifiedAccountCodes.length > 0) {
    proposals.push({
      key: "unclassified_account_review",
      title: "Tinjau kode akun di luar chart of accounts sebelum dimasukkan ke perhitungan pajak",
      description:
        `${unclassifiedAccountCodes.length} kode akun pada periode ini (${unclassifiedAccountCodes.join(", ")}) tidak dikenali di chart of accounts ` +
        `mkh-properti yang dipakai modul ini -- kemungkinan entri dari sinkronisasi mkhsistem dengan kode akun asing. Nilai transaksi ini TIDAK ` +
        `disertakan dalam perhitungan di atas sampai diklasifikasikan secara manual, supaya tidak salah masuk atau salah keluar dari basis pajak.`,
      estimatedImpactIdr: null,
      confidence: "tinggi",
      requiresProfessionalReview: true,
    });
  }

  if (finalRevenueGrossIdr > 0) {
    proposals.push({
      key: "rsh_ppn_exemption_check",
      title: "Cek kelayakan Rumah Sederhana (RSH) bersubsidi untuk tarif PPh Final 1% dan pembebasan PPN",
      description:
        `Ledger mkh-properti tidak menandai unit mana yang memenuhi kriteria Rumah Sederhana bersubsidi (RSH). Jika ada unit yang memenuhi kriteria, ` +
        `unit tersebut berhak atas tarif PPh Final Pasal 4(2) 1% (bukan 2,5%) dan pembebasan PPN atas penyerahannya -- berpotensi menurunkan ` +
        `estimasi PPh Final ${idr(finalTaxLiabilityIdr)} di atas jika sebagian unit ini termasuk RSH. Perlu konfirmasi manual per unit terjual.`,
      estimatedImpactIdr: null,
      confidence: "rendah",
      requiresProfessionalReview: true,
    });
  }

  if (fixedAssetBalanceIdr > 0) {
    proposals.push({
      key: "depreciation_method_review",
      title: "Tinjau metode penyusutan aset tetap",
      description:
        `Saldo aset tetap (${MKH_COA_LABELS["1-2001"]}, ${MKH_COA_LABELS["1-2002"]}, ${MKH_COA_LABELS["1-2003"]}) sampai akhir periode ini sekitar ` +
        `${idr(fixedAssetBalanceIdr)}. Ledger tidak menyimpan jadwal penyusutan, jadi dampaknya tidak dihitung di sini -- namun memilih metode saldo ` +
        `menurun (dipercepat) dibanding garis lurus untuk aset yang memenuhi syarat (Pasal 11 UU PPh) dapat mempercepat pengurangan penghasilan kena ` +
        `pajak non-final di tahun-tahun awal (manfaat penundaan waktu bayar, bukan pengurangan permanen).`,
      estimatedImpactIdr: null,
      confidence: "rendah",
      requiresProfessionalReview: true,
    });
  }

  return {
    periodStart,
    periodEnd,
    finalRevenueGrossIdr,
    finalTaxLiabilityIdr,
    nonFinalRevenueIdr,
    cogsIdr,
    opexIdr,
    taxableIncomeNonFinalBeforeLossIdr,
    lossCarryforwardAppliedIdr,
    taxableIncomeNonFinalIdr,
    newFiscalLossIdr,
    estimatedTurnoverIdr,
    eligibleFor31E,
    regime31E: { taxIdr: regime31ETaxIdr },
    eligibleForUmkmFinal: { eligible: umkmEligible, reason: umkmReason, taxIdr: umkmTaxIdr },
    recommendedNonFinalRegime,
    nonFinalTaxLiabilityIdr,
    naiveFlatTaxIdr,
    totalEstimatedTaxIdr,
    estimatedSavingsVsNaiveIdr,
    unclassifiedAccountCodes,
    fixedAssetBalanceIdr,
    opexReviewIdr,
    proposals,
  };
}
