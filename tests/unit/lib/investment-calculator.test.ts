import { describe, expect, it } from "vitest";

import {
  LOT_PRICE_IDR,
  ROOM_PRICE_IDR,
  TOTAL_PROJECT_LOTS,
  calculateGrossRevenue,
  calculateInvestment,
  clampLots,
  estimateInvestorProfit,
  simulateProject,
} from "@/lib/loonars/investment-calculator";

describe("investment-calculator: lot pricing", () => {
  it("1 lot = Rp28.000.000", () => {
    expect(calculateInvestment({ lots: 1, isFullRoom: false }).investmentIdr).toBe(28_000_000);
  });

  it("2 lot = Rp56.000.000", () => {
    expect(calculateInvestment({ lots: 2, isFullRoom: false }).investmentIdr).toBe(56_000_000);
  });

  it("5 lot = Rp140.000.000", () => {
    expect(calculateInvestment({ lots: 5, isFullRoom: false }).investmentIdr).toBe(140_000_000);
  });

  it("7 lot = Rp196.000.000", () => {
    expect(calculateInvestment({ lots: 7, isFullRoom: false }).investmentIdr).toBe(196_000_000);
  });

  it("8 lot = Rp224.000.000", () => {
    expect(calculateInvestment({ lots: 8, isFullRoom: false }).investmentIdr).toBe(224_000_000);
  });

  it("15 lot = Rp420.000.000 = 1 kamar penuh", () => {
    const result = calculateInvestment({ lots: 15, isFullRoom: false });
    expect(result.investmentIdr).toBe(420_000_000);
    expect(result.investmentIdr).toBe(ROOM_PRICE_IDR);
    expect(result.roomEquivalent).toBe(1);
  });

  it("FULL KAMAR always resolves to 15 lot / Rp420.000.000 regardless of the lots field", () => {
    const result = calculateInvestment({ lots: 3, isFullRoom: true });
    expect(result.lots).toBe(15);
    expect(result.investmentIdr).toBe(420_000_000);
  });

  it("7 lot is 46.67% equivalent of 1 kamar", () => {
    const result = calculateInvestment({ lots: 7, isFullRoom: false });
    expect(result.roomEquivalentPercent).toBeCloseTo(46.666_666_67, 5);
  });

  it("clamps lots to the 1-15 range", () => {
    expect(clampLots(0)).toBe(1);
    expect(clampLots(-5)).toBe(1);
    expect(clampLots(16)).toBe(15);
    expect(clampLots(100)).toBe(15);
  });

  it("every lot count 1-15 is an exact integer multiple of Rp28.000.000, no floating point drift", () => {
    for (let lots = 1; lots <= 15; lots++) {
      const result = calculateInvestment({ lots, isFullRoom: false });
      expect(result.investmentIdr).toBe(lots * LOT_PRICE_IDR);
      expect(Number.isInteger(result.investmentIdr)).toBe(true);
    }
  });
});

describe("investment-calculator: revenue and profit", () => {
  it("matches the spec's worked example: 20 kamar x Rp700rb x 50% x 30 hari = Rp210.000.000", () => {
    expect(calculateGrossRevenue({ averageDailyRateIdr: 700_000, occupancyPercent: 50, opexPercent: 30 })).toBe(210_000_000);
  });

  it("matches the spec's worked example: Rp210jt revenue, 30% OPEX -> Rp147jt net profit", () => {
    const result = simulateProject({ averageDailyRateIdr: 700_000, occupancyPercent: 50, opexPercent: 30 });
    expect(result.grossRevenueIdr).toBe(210_000_000);
    expect(result.netProfitIdr).toBe(147_000_000);
  });

  it("investor pool (70%) + MKH pool (30%) always equals net profit exactly, no rounding gap", () => {
    // Deliberately awkward inputs to try to provoke a rounding mismatch.
    const cases = [
      { averageDailyRateIdr: 733_333, occupancyPercent: 37, opexPercent: 29 },
      { averageDailyRateIdr: 1, occupancyPercent: 1, opexPercent: 1 },
      { averageDailyRateIdr: 999_999, occupancyPercent: 65, opexPercent: 33 },
      { averageDailyRateIdr: 700_000, occupancyPercent: 50, opexPercent: 30 },
    ];
    for (const assumptions of cases) {
      const result = simulateProject(assumptions);
      expect(result.investorPoolIdr + result.mkhPoolIdr).toBe(result.netProfitIdr);
    }
  });
});

describe("investment-calculator: investor profit share", () => {
  it("profit investor for 15 lot (full kamar) = 15 x profit per lot", () => {
    const { investorPoolIdr } = simulateProject({ averageDailyRateIdr: 700_000, occupancyPercent: 50, opexPercent: 30 });
    const perLot = estimateInvestorProfit(investorPoolIdr, 1);
    const fullRoom = estimateInvestorProfit(investorPoolIdr, 15);
    expect(fullRoom.perMonthIdr).toBe(15 * perLot.profitPerLotIdr);
  });

  it("annual estimate is exactly 12x the monthly estimate", () => {
    const { investorPoolIdr } = simulateProject({ averageDailyRateIdr: 700_000, occupancyPercent: 50, opexPercent: 30 });
    const result = estimateInvestorProfit(investorPoolIdr, 7);
    expect(result.perYearIdr).toBe(result.perMonthIdr * 12);
  });

  it("sum of every lot's profit share across the whole project never exceeds the investor pool", () => {
    const { investorPoolIdr } = simulateProject({ averageDailyRateIdr: 700_000, occupancyPercent: 65, opexPercent: 25 });
    const { profitPerLotIdr } = estimateInvestorProfit(investorPoolIdr, 1);
    expect(profitPerLotIdr * TOTAL_PROJECT_LOTS).toBeLessThanOrEqual(investorPoolIdr);
  });
});
