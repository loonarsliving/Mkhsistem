import { describe, expect, it } from "vitest";

import {
  computeScheduleEnd,
  dailyBudgetFromTotal,
  isAdDurationDays,
  isScheduleEnded,
  parseCampaignSchedule,
  remainingScheduleDays,
  toMetaUnixTimestamp,
} from "@/lib/ads/campaign-schedule";

describe("isAdDurationDays", () => {
  it("only accepts 7, 14, 30", () => {
    expect([7, 14, 30].every(isAdDurationDays)).toBe(true);
    expect([0, 1, 10, 31, 60].some(isAdDurationDays)).toBe(false);
  });
});

describe("dailyBudgetFromTotal", () => {
  it("rounds down so daily × days never exceeds the total", () => {
    expect(dailyBudgetFromTotal(3_000_000, 30)).toBe(100_000);
    expect(dailyBudgetFromTotal(1_000_000, 7)).toBe(142_857);
    expect(dailyBudgetFromTotal(1_000_000, 7) * 7).toBeLessThanOrEqual(1_000_000);
  });

  it("returns 0 for invalid input", () => {
    expect(dailyBudgetFromTotal(0, 7)).toBe(0);
    expect(dailyBudgetFromTotal(-5, 7)).toBe(0);
    expect(dailyBudgetFromTotal(Number.NaN, 7)).toBe(0);
    expect(dailyBudgetFromTotal(100_000, 0)).toBe(0);
  });
});

describe("parseCampaignSchedule", () => {
  it("null/undefined means no schedule (legacy continuous behavior)", () => {
    expect(parseCampaignSchedule(null)).toEqual({ ok: true, schedule: null });
    expect(parseCampaignSchedule(undefined)).toEqual({ ok: true, schedule: null });
  });

  it("computes the daily budget for a valid schedule", () => {
    expect(parseCampaignSchedule({ durationDays: 14, totalBudgetIdr: 1_400_000 })).toEqual({
      ok: true,
      schedule: { durationDays: 14, totalBudgetIdr: 1_400_000, dailyBudgetIdr: 100_000 },
    });
  });

  it("rejects durations other than 7/14/30", () => {
    expect(parseCampaignSchedule({ durationDays: 10, totalBudgetIdr: 1_000_000 }).ok).toBe(false);
  });

  it("rejects an empty/zero total", () => {
    expect(parseCampaignSchedule({ durationDays: 7, totalBudgetIdr: 0 }).ok).toBe(false);
    expect(parseCampaignSchedule({ durationDays: 7, totalBudgetIdr: Number.NaN }).ok).toBe(false);
  });

  it("rejects a total that gives less than Rp10.000/day", () => {
    const result = parseCampaignSchedule({ durationDays: 30, totalBudgetIdr: 299_999 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("300.000");
    expect(parseCampaignSchedule({ durationDays: 30, totalBudgetIdr: 300_000 }).ok).toBe(true);
  });
});

describe("schedule end helpers", () => {
  const start = new Date("2026-11-03T10:00:00Z");

  it("ends exactly N × 24h after start", () => {
    expect(computeScheduleEnd(start, 30).toISOString()).toBe("2026-12-03T10:00:00.000Z");
  });

  it("counts remaining days rounded up, 0 once passed", () => {
    const end = computeScheduleEnd(start, 7);
    expect(remainingScheduleDays(end, start)).toBe(7);
    expect(remainingScheduleDays(end, new Date("2026-11-09T11:00:00Z"))).toBe(1);
    expect(remainingScheduleDays(end, new Date("2026-11-10T10:00:00Z"))).toBe(0);
    expect(isScheduleEnded(end, new Date("2026-11-10T10:00:01Z"))).toBe(true);
    expect(isScheduleEnded(end, start)).toBe(false);
    expect(isScheduleEnded(null)).toBe(false);
  });

  it("converts to a Meta UNIX timestamp in seconds", () => {
    expect(toMetaUnixTimestamp(start)).toBe(Date.parse("2026-11-03T10:00:00Z") / 1000);
  });
});
