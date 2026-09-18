/**
 * Kalkulator Investasi Loonars — pure-TS calculation engine.
 *
 * All money math is done in integer Rupiah (never floating point) to avoid
 * rounding drift between the investor's slice and the project total. A lot
 * is always Rp28.000.000 (Rp420.000.000 / 15) and a project is always 300
 * lots (20 kamar x 15 lot) -- these are fixed product facts, not
 * configurable assumptions, per the product structure the sales team sells
 * today. Occupancy/ADR/OPEX ARE assumptions and stay caller-supplied so this
 * module never hardcodes a projected result.
 *
 * Wording: every output here is a simulation/estimate, never a guaranteed
 * return -- callers must keep language consistent with that (see the
 * disclaimer text exported below).
 */

export const ROOM_PRICE_IDR = 420_000_000;
export const LOTS_PER_ROOM = 15;
export const LOT_PRICE_IDR = ROOM_PRICE_IDR / LOTS_PER_ROOM; // Rp28.000.000

export const ROOMS_PER_PROJECT = 20;
export const TOTAL_PROJECT_LOTS = ROOMS_PER_PROJECT * LOTS_PER_ROOM; // 300

export const INVESTOR_PROFIT_SHARE = 0.7;
export const MKH_PROFIT_SHARE = 0.3;

export const OPERATIONAL_DAYS_PER_MONTH = 30;

export const MIN_LOTS = 1;
export const MAX_LOTS = LOTS_PER_ROOM;

export type InvestmentScenarioKey = "konservatif" | "moderat" | "optimistis";

export interface InvestmentScenario {
  key: InvestmentScenarioKey;
  label: string;
  occupancyPercent: number;
}

// Admin-editable defaults. No real project-level occupancy config exists yet
// in the codebase (audited: loonars_projects/loonars_units model land-sale
// kavling blocks, not rental-room occupancy) -- these are a simple, clearly
// documented starting point, editable here until a real config exists.
export const DEFAULT_SCENARIOS: InvestmentScenario[] = [
  { key: "konservatif", label: "Konservatif", occupancyPercent: 35 },
  { key: "moderat", label: "Moderat", occupancyPercent: 50 },
  { key: "optimistis", label: "Optimistis", occupancyPercent: 65 },
];

export const DEFAULT_AVERAGE_DAILY_RATE_IDR = 700_000;
export const DEFAULT_OPEX_PERCENT = 30;

export const QUICK_PRESET_LOTS = [1, 2, 3, 5, 7, 8, 15] as const;

export const SIMULATION_DISCLAIMER =
  "Simulasi ini hanya merupakan ilustrasi berdasarkan asumsi yang dimasukkan. Hasil aktual bergantung pada performa operasional proyek dan kondisi bisnis. Simulasi bukan merupakan jaminan keuntungan.";

export interface InvestmentSelection {
  lots: number;
  isFullRoom: boolean;
}

export interface InvestmentResult {
  lots: number;
  investmentIdr: number;
  roomEquivalent: number; // e.g. 7/15
  roomEquivalentPercent: number; // e.g. 46.666...
}

/** Clamps a raw lot count into the valid 1-15 integer range. */
export function clampLots(lots: number): number {
  return Math.min(MAX_LOTS, Math.max(MIN_LOTS, Math.round(lots)));
}

export function calculateInvestment(selection: InvestmentSelection): InvestmentResult {
  const lots = selection.isFullRoom ? LOTS_PER_ROOM : clampLots(selection.lots);
  const investmentIdr = lots * LOT_PRICE_IDR;
  const roomEquivalent = lots / LOTS_PER_ROOM;
  return {
    lots,
    investmentIdr,
    roomEquivalent,
    roomEquivalentPercent: roomEquivalent * 100,
  };
}

export interface ProjectAssumptions {
  averageDailyRateIdr: number;
  occupancyPercent: number;
  opexPercent: number;
}

export interface ProjectSimulation {
  grossRevenueIdr: number;
  netProfitIdr: number;
  investorPoolIdr: number;
  mkhPoolIdr: number;
}

/** Gross Revenue = kamar x ADR x occupancy x hari operasional. */
export function calculateGrossRevenue(assumptions: ProjectAssumptions): number {
  return Math.round(ROOMS_PER_PROJECT * assumptions.averageDailyRateIdr * (assumptions.occupancyPercent / 100) * OPERATIONAL_DAYS_PER_MONTH);
}

/**
 * Net Profit = Gross Revenue x (1 - OPEX%). Investor/MKH pools are rounded
 * independently and MKH's pool absorbs the rounding remainder so
 * investorPool + mkhPool always equals netProfit exactly (no drift).
 */
export function simulateProject(assumptions: ProjectAssumptions): ProjectSimulation {
  const grossRevenueIdr = calculateGrossRevenue(assumptions);
  const netProfitIdr = Math.round(grossRevenueIdr * (1 - assumptions.opexPercent / 100));
  const investorPoolIdr = Math.round(netProfitIdr * INVESTOR_PROFIT_SHARE);
  const mkhPoolIdr = netProfitIdr - investorPoolIdr;

  return { grossRevenueIdr, netProfitIdr, investorPoolIdr, mkhPoolIdr };
}

export interface InvestorProfitEstimate {
  profitPerLotIdr: number;
  perMonthIdr: number;
  perYearIdr: number;
}

/**
 * Profit per lot = Investor Pool / 300 (rounded down so the sum of every
 * investor's per-lot share can never exceed the investor pool). Per-year is
 * per-month x 12 -- a plain monthly simulation carried forward, not a
 * separate annual assumption.
 */
export function estimateInvestorProfit(investorPoolIdr: number, lots: number): InvestorProfitEstimate {
  const profitPerLotIdr = Math.floor(investorPoolIdr / TOTAL_PROJECT_LOTS);
  const perMonthIdr = profitPerLotIdr * lots;
  return { profitPerLotIdr, perMonthIdr, perYearIdr: perMonthIdr * 12 };
}
