/**
 * Loonars AI Occupancy Ads — pure-TS occupancy gap/classification engine.
 *
 * No AI, no network dependency here: every numeric signal (occupancy_gap,
 * classification, budget recommendation) is computed deterministically in
 * application code, per FRIDAY's guardrail principle (root CLAUDE.md) --
 * "numeric signals must always be computed in application code, never
 * invented/computed by the LLM". The AI engine (lib/ai/domains/occupancy-ads.ts)
 * is only ever handed the *results* of this module to reason about
 * market/persona/creative/copy -- it never does this arithmetic itself.
 */

import type { OccupancyDay } from "./types";

export type OccupancyClassification = "LOW" | "HEALTHY" | "HIGH" | "FULL";

export interface OccupancyThresholds {
  /** Below this occupancy %, a date is classified LOW (advertise it). */
  targetOccupancyPct: number;
  /** At/above this occupancy %, a date is classified HIGH (don't advertise). */
  criticalOccupancyPct: number;
}

export interface ClassifiedOccupancyDay extends OccupancyDay {
  /** target - actual, in percentage points. Positive = under target (room to fill). */
  occupancyGapPct: number;
  classification: OccupancyClassification;
}

/**
 * Classifies a single day's occupancy against admin-configured thresholds.
 * FULL = 100% (zero availableUnits) regardless of thresholds -- there is
 * nothing to sell on a fully-booked date no matter how the thresholds are
 * set. HIGH = at/above criticalOccupancyPct but not full. LOW = below
 * targetOccupancyPct. HEALTHY = everything in between.
 */
export function classifyOccupancyDay(day: OccupancyDay, thresholds: OccupancyThresholds): ClassifiedOccupancyDay {
  const occupancyGapPct = Math.round((thresholds.targetOccupancyPct - day.occupancyPct) * 10) / 10;

  let classification: OccupancyClassification;
  if (day.availableUnits <= 0 && day.totalUnits > 0) {
    classification = "FULL";
  } else if (day.occupancyPct >= thresholds.criticalOccupancyPct) {
    classification = "HIGH";
  } else if (day.occupancyPct < thresholds.targetOccupancyPct) {
    classification = "LOW";
  } else {
    classification = "HEALTHY";
  }

  return { ...day, occupancyGapPct, classification };
}

export function classifyOccupancyCalendar(days: OccupancyDay[], thresholds: OccupancyThresholds): ClassifiedOccupancyDay[] {
  return days.map((day) => classifyOccupancyDay(day, thresholds));
}

/**
 * "Don't advertise full/high inventory dates" rule (spec) -- implemented as
 * code-level filtering, never left to the AI's discretion. Only LOW dates
 * are candidates for a fresh occupancy-driving campaign; HEALTHY/HIGH/FULL
 * dates should never appear in an ad's target_dates.
 */
export function selectAdvertisableDates(days: ClassifiedOccupancyDay[]): ClassifiedOccupancyDay[] {
  return days.filter((d) => d.classification === "LOW");
}

export interface GapSummary {
  totalDays: number;
  lowDays: number;
  healthyDays: number;
  highDays: number;
  fullDays: number;
  averageOccupancyPct: number;
  averageGapPct: number;
}

export function summarizeGap(days: ClassifiedOccupancyDay[]): GapSummary {
  const totalDays = days.length;
  if (totalDays === 0) {
    return { totalDays: 0, lowDays: 0, healthyDays: 0, highDays: 0, fullDays: 0, averageOccupancyPct: 0, averageGapPct: 0 };
  }
  const lowDays = days.filter((d) => d.classification === "LOW").length;
  const healthyDays = days.filter((d) => d.classification === "HEALTHY").length;
  const highDays = days.filter((d) => d.classification === "HIGH").length;
  const fullDays = days.filter((d) => d.classification === "FULL").length;
  const averageOccupancyPct = Math.round((days.reduce((sum, d) => sum + d.occupancyPct, 0) / totalDays) * 10) / 10;
  const averageGapPct = Math.round((days.reduce((sum, d) => sum + d.occupancyGapPct, 0) / totalDays) * 10) / 10;
  return { totalDays, lowDays, healthyDays, highDays, fullDays, averageOccupancyPct, averageGapPct };
}

/**
 * Budget recommendation -- computed in code from the gap, never by the
 * model. Linear scale from 0 (no gap / not LOW) up to the admin's
 * maxDailyBudgetIdr at a 100-percentage-point gap, floored at a sane
 * minimum so a tiny gap still produces a usable (not zero) budget, and
 * always hard-capped at maxDailyBudgetIdr regardless of how large the gap
 * computes to.
 */
export function recommendDailyBudgetIdr(averageGapPct: number, maxDailyBudgetIdr: number, minDailyBudgetIdr = 20_000): number {
  if (maxDailyBudgetIdr <= 0) return 0;
  if (averageGapPct <= 0) return 0;
  const scaled = Math.round((Math.min(averageGapPct, 100) / 100) * maxDailyBudgetIdr);
  return Math.min(maxDailyBudgetIdr, Math.max(minDailyBudgetIdr, scaled));
}
