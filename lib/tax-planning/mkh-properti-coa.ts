/**
 * Mirror of mkh-properti's chart of accounts (src/lib/master.ts in the
 * mkh-properti repo). The COA is NOT database-resident there -- it's a
 * hardcoded TypeScript array on their side too, so there is no table this
 * module can query for it. This file is a deliberate, minimal copy of just
 * the account codes Tax Planning needs to classify revenue/expense rows
 * pulled from mkh-properti's `jurnal` table.
 *
 * PENTING / IMPORTANT: `kode` values must exactly match mkh-properti's COA
 * (src/lib/master.ts, `jurnal.akun` is free-text keyed to these codes with
 * no FK constraint). If mkh-properti's COA changes, this file drifts silently
 * -- there is no automated check across the two repos. Re-verify against
 * mkh-properti's src/lib/master.ts before trusting a classification here.
 */

export type MkhProyekId = "AFP" | "IH" | "LL" | "GCI" | "GCR" | "HO";

export const MKH_PROYEK_LABELS: Record<MkhProyekId, string> = {
  AFP: "Al Fath Puuwatu",
  IH: "Introvert House",
  LL: "Loonars Living",
  GCI: "Griya Cariu Indah",
  GCR: "Green Cibarusah Residence",
  HO: "Kantor Pusat / Overhead",
};

/**
 * Revenue accounts for the sale/transfer of land & building units (rumah).
 * Under PP 34/2016, this income is subject to FINAL PPh Pasal 4(2) --
 * 2.5% of gross transfer value (1% only for verified RSH/subsidized-housing
 * units, which mkh-properti's ledger does not tag today -- see
 * calculator.ts) -- and is EXCLUDED from the normal PPh Badan taxable-income
 * base. Mixing this into a flat 22%/25% computation on total laba sebelum
 * pajak is the single most common way a property developer overpays PPh
 * Badan, which is why separating these codes out is the core of this
 * module's calculation.
 */
export const FINAL_PP34_REVENUE_CODES = ["4-1001", "4-1002"] as const;

/** Revenue not from a land/building transfer -- ordinary non-final taxable income (normal PPh Badan regime). */
export const NON_FINAL_REVENUE_CODES = ["4-1003"] as const;

/** Cost of goods sold for property development -- direct construction/material/labor cost of the units sold. */
export const COGS_CODES = ["5-1001", "5-1002", "5-1003", "5-1004", "5-1005"] as const;

/** Operating expense accounts -- mostly HO (head-office) overhead, not tied to one project's home sales. */
export const OPEX_CODES = [
  "6-1001",
  "6-1002",
  "6-1003",
  "6-1004",
  "6-1005",
  "6-1006",
  "6-1007",
  "6-1008",
  "6-1009",
  "6-1010",
] as const;

/** "Beban Lain-lain" -- catch-all opex code, worth a Pasal 9 non-deductible-expense sanity check rather than an automatic deduction. */
export const OPEX_REVIEW_CODES = ["6-1007"] as const;

/** Fixed-asset accounts -- candidates for a depreciation-method timing review (calculator.ts only flags a nonzero balance, it doesn't compute depreciation itself since no schedule is tracked in the ledger). */
export const FIXED_ASSET_CODES = ["1-2001", "1-2002", "1-2003"] as const;

export const MKH_COA_LABELS: Record<string, string> = {
  "4-1001": "Penjualan Rumah",
  "4-1002": "Uang Muka Penjualan",
  "4-1003": "Pendapatan Lain",
  "5-1001": "Pembelian Material",
  "5-1002": "Bayar Distributor",
  "5-1003": "Biaya Upah Tukang",
  "5-1004": "Biaya Subkontraktor",
  "5-1005": "Biaya Overhead Proyek",
  "6-1001": "Gaji Staf",
  "6-1002": "Sewa Kantor",
  "6-1003": "Listrik & Air",
  "6-1004": "Transportasi",
  "6-1005": "Perizinan & Notaris",
  "6-1006": "Biaya Pemasaran",
  "6-1007": "Beban Lain-lain",
  "6-1008": "Komisi Sales",
  "6-1009": "Bonus Karyawan",
  "6-1010": "Reimbursement Karyawan",
  "1-2001": "Tanah",
  "1-2002": "Bangunan / Konstruksi",
  "1-2003": "Peralatan",
};

const KNOWN_CODES = new Set<string>([
  ...FINAL_PP34_REVENUE_CODES,
  ...NON_FINAL_REVENUE_CODES,
  ...COGS_CODES,
  ...OPEX_CODES,
  ...FIXED_ASSET_CODES,
  "1-1001",
  "1-1002",
  "1-1003",
  "1-1004",
  "1-1005",
  "1-1008",
  "1-1006",
  "1-1007",
  "2-1001",
  "2-1002",
  "2-1003",
  "2-1004",
  "2-2001",
  "3-1001",
  "3-1002",
]);

/** True if a jurnal.akun value isn't part of the mirrored COA above -- e.g. a foreign code inserted by mkhsistem's own construction-expense sync (see mkh-properti's `akunAsing` concept). Callers should not silently include unclassified rows in a tax computation. */
export function isUnclassifiedAccount(kode: string): boolean {
  return !KNOWN_CODES.has(kode);
}
