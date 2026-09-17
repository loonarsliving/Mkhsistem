import { describe, expect, it } from "vitest";

import { classifyOccupancyCalendar, classifyOccupancyDay, recommendDailyBudgetIdr, selectAdvertisableDates, summarizeGap } from "@/lib/occupancy/gap-engine";
import type { OccupancyDay } from "@/lib/occupancy/types";

const thresholds = { targetOccupancyPct: 60, criticalOccupancyPct: 90 };

function day(overrides: Partial<OccupancyDay>): OccupancyDay {
  return {
    date: "2026-10-01",
    roomTypeCode: "standard",
    roomTypeName: "Standard",
    totalUnits: 10,
    availableUnits: 5,
    occupiedUnits: 5,
    occupancyPct: 50,
    ...overrides,
  };
}

describe("classifyOccupancyDay", () => {
  it("classifies LOW when below target", () => {
    const result = classifyOccupancyDay(day({ occupancyPct: 40, occupiedUnits: 4, availableUnits: 6 }), thresholds);
    expect(result.classification).toBe("LOW");
    expect(result.occupancyGapPct).toBe(20);
  });

  it("classifies HEALTHY between target and critical", () => {
    const result = classifyOccupancyDay(day({ occupancyPct: 75, occupiedUnits: 7, availableUnits: 3 }), thresholds);
    expect(result.classification).toBe("HEALTHY");
  });

  it("classifies HIGH at/above critical but not full", () => {
    const result = classifyOccupancyDay(day({ occupancyPct: 90, occupiedUnits: 9, availableUnits: 1 }), thresholds);
    expect(result.classification).toBe("HIGH");
  });

  it("classifies FULL when zero units available, regardless of thresholds", () => {
    const result = classifyOccupancyDay(day({ occupancyPct: 100, occupiedUnits: 10, availableUnits: 0 }), thresholds);
    expect(result.classification).toBe("FULL");
  });

  it("computes negative gap when occupancy exceeds target (over target, not under)", () => {
    const result = classifyOccupancyDay(day({ occupancyPct: 80, occupiedUnits: 8, availableUnits: 2 }), thresholds);
    expect(result.occupancyGapPct).toBe(-20);
  });

  it("does not classify FULL when totalUnits is zero (no inventory, not sold out)", () => {
    const result = classifyOccupancyDay(day({ totalUnits: 0, availableUnits: 0, occupiedUnits: 0, occupancyPct: 0 }), thresholds);
    expect(result.classification).toBe("LOW");
  });
});

describe("selectAdvertisableDates", () => {
  it("never includes HEALTHY, HIGH, or FULL dates -- the don't-advertise-full-inventory rule", () => {
    const days = classifyOccupancyCalendar(
      [
        day({ date: "2026-10-01", occupancyPct: 30, occupiedUnits: 3, availableUnits: 7 }),
        day({ date: "2026-10-02", occupancyPct: 75, occupiedUnits: 7, availableUnits: 3 }),
        day({ date: "2026-10-03", occupancyPct: 95, occupiedUnits: 9, availableUnits: 1 }),
        day({ date: "2026-10-04", occupancyPct: 100, occupiedUnits: 10, availableUnits: 0 }),
      ],
      thresholds,
    );
    const advertisable = selectAdvertisableDates(days);
    expect(advertisable.map((d) => d.date)).toEqual(["2026-10-01"]);
    expect(advertisable.every((d) => d.classification === "LOW")).toBe(true);
  });
});

describe("summarizeGap", () => {
  it("summarizes an empty calendar without dividing by zero", () => {
    expect(summarizeGap([])).toEqual({ totalDays: 0, lowDays: 0, healthyDays: 0, highDays: 0, fullDays: 0, averageOccupancyPct: 0, averageGapPct: 0 });
  });

  it("counts each classification bucket and averages correctly", () => {
    const days = classifyOccupancyCalendar(
      [
        day({ date: "2026-10-01", occupancyPct: 20, occupiedUnits: 2, availableUnits: 8 }),
        day({ date: "2026-10-02", occupancyPct: 70, occupiedUnits: 7, availableUnits: 3 }),
      ],
      thresholds,
    );
    const summary = summarizeGap(days);
    expect(summary.totalDays).toBe(2);
    expect(summary.lowDays).toBe(1);
    expect(summary.healthyDays).toBe(1);
    expect(summary.averageOccupancyPct).toBe(45);
  });
});

describe("recommendDailyBudgetIdr", () => {
  it("returns 0 when there is no gap", () => {
    expect(recommendDailyBudgetIdr(0, 500_000)).toBe(0);
    expect(recommendDailyBudgetIdr(-10, 500_000)).toBe(0);
  });

  it("returns 0 when the admin ceiling is not configured", () => {
    expect(recommendDailyBudgetIdr(50, 0)).toBe(0);
  });

  it("scales linearly with the gap, never exceeding the ceiling", () => {
    expect(recommendDailyBudgetIdr(50, 500_000)).toBe(250_000);
    expect(recommendDailyBudgetIdr(100, 500_000)).toBe(500_000);
    expect(recommendDailyBudgetIdr(150, 500_000)).toBe(500_000); // clamped, gap never exceeds 100 in practice but the clamp still holds
  });

  it("floors a tiny gap at the configured minimum instead of returning a near-zero budget", () => {
    expect(recommendDailyBudgetIdr(1, 500_000, 20_000)).toBe(20_000);
  });
});
