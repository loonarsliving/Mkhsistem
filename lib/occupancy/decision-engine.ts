/**
 * Loonars AI Occupancy Ads — pure-TS Campaign Decision Engine (spec §36).
 *
 * Mirrors gap-engine.ts's discipline: deterministic, no AI arithmetic, no
 * network call in this file. Given a campaign's CURRENT occupancy
 * classification (from gap-engine.ts, re-run against today's real
 * villa-api data — never a cached/stale classification), its Meta ad
 * performance (lib/meta/ads.ts's AdInsights shape: spend, clicks, CTR —
 * CPC is derived here in code, never asked of the model), and an
 * inventory-thinness signal, returns exactly one of
 * SCALE / MAINTAIN / REDUCE / PAUSE with plain-language reasoning.
 *
 * This is a RECOMMENDATION only (root CLAUDE.md's ASSISTED-mode
 * constraint) — nothing in this file calls Meta or changes a campaign's
 * budget/status; the Server Action that calls this stores the result in
 * loonars_campaign_recommendations and a human decides whether to apply it
 * (features/occupancy-ads/actions/occupancy-ads.actions.ts).
 *
 * Priority order (first match wins, matches the spec's own ordering):
 *   1. PAUSE  — occupancy is now HIGH/FULL, this date range no longer
 *      needs advertising at all, regardless of how well the ad performs.
 *   2. REDUCE — inventory is thin (about to sell out anyway) OR CAC/CPC
 *      has worsened materially since the last check — spending more here
 *      is either unnecessary or increasingly wasteful.
 *   3. SCALE  — still LOW (still needs filling) AND performance is
 *      healthy (CTR at/above the healthy floor) — more budget is likely
 *      to convert to more bookings.
 *   4. MAINTAIN — everything else: healthy enough, no urgent problem, no
 *      clear case for more spend either.
 */

import type { OccupancyClassification } from "./gap-engine";
import { CAC_WORSENING_THRESHOLD_FRACTION, INVENTORY_THIN_AVAILABLE_UNITS_THRESHOLD, MIN_HEALTHY_CTR_PERCENT } from "./campaign-rules";

export type CampaignDecision = "SCALE" | "MAINTAIN" | "REDUCE" | "PAUSE";

export interface DecisionEngineMetaInsights {
  spendIdr: number;
  clicks: number;
  ctrPercent: number;
}

export interface DecisionEngineInput {
  /** The campaign's target dates re-classified against TODAY's real occupancy data (never a stale classification from when the campaign was drafted). Pass the worst (highest-occupancy) classification among the target dates that haven't passed yet. */
  currentClassification: OccupancyClassification;
  /** Fewest available units remaining across the campaign's still-upcoming target dates. */
  minAvailableUnits: number;
  insights: DecisionEngineMetaInsights;
  /** The metrics_snapshot of the previous recommendation for this campaign, if any -- null when this is the first check (nothing to compare a trend against yet). */
  previousInsights: DecisionEngineMetaInsights | null;
}

export interface CampaignDecisionResult {
  decision: CampaignDecision;
  reasoning: string[];
  /** Cost-per-click, computed in code (spendIdr / clicks, 0 when there are no clicks yet) -- never asked of the model. */
  cpcIdr: number;
  previousCpcIdr: number | null;
}

function computeCpcIdr(insights: DecisionEngineMetaInsights): number {
  if (insights.clicks <= 0) return 0;
  return Math.round(insights.spendIdr / insights.clicks);
}

/**
 * Decides SCALE / MAINTAIN / REDUCE / PAUSE for one campaign. Pure and
 * deterministic — same input always produces the same output, no I/O.
 */
export function decideCampaignAction(input: DecisionEngineInput): CampaignDecisionResult {
  const reasoning: string[] = [];
  const cpcIdr = computeCpcIdr(input.insights);
  const previousCpcIdr = input.previousInsights ? computeCpcIdr(input.previousInsights) : null;

  // 1. PAUSE -- occupancy already recovered, nothing left to sell here.
  if (input.currentClassification === "HIGH" || input.currentClassification === "FULL") {
    reasoning.push(`Okupansi tanggal target sekarang ${input.currentClassification} -- tidak lagi butuh iklan untuk mengisi periode ini.`);
    return { decision: "PAUSE", reasoning, cpcIdr, previousCpcIdr };
  }

  // 2. REDUCE -- thin inventory or a worsening CAC/CPC trend.
  const inventoryThin = input.minAvailableUnits <= INVENTORY_THIN_AVAILABLE_UNITS_THRESHOLD;
  if (inventoryThin) {
    reasoning.push(`Unit tersisa tinggal ${input.minAvailableUnits} (ambang tipis: <= ${INVENTORY_THIN_AVAILABLE_UNITS_THRESHOLD}) -- risiko overselling kalau terus digenjot.`);
  }

  let cacWorsened = false;
  if (previousCpcIdr !== null && previousCpcIdr > 0) {
    const changeFraction = (cpcIdr - previousCpcIdr) / previousCpcIdr;
    if (changeFraction > CAC_WORSENING_THRESHOLD_FRACTION) {
      cacWorsened = true;
      reasoning.push(
        `CPC memburuk dari Rp${previousCpcIdr.toLocaleString("id-ID")} menjadi Rp${cpcIdr.toLocaleString("id-ID")} (naik ${Math.round(changeFraction * 100)}%, ambang: ${Math.round(CAC_WORSENING_THRESHOLD_FRACTION * 100)}%).`,
      );
    }
  }

  if (inventoryThin || cacWorsened) {
    return { decision: "REDUCE", reasoning, cpcIdr, previousCpcIdr };
  }

  // 3. SCALE -- still needed and performing well.
  const ctrHealthy = input.insights.ctrPercent >= MIN_HEALTHY_CTR_PERCENT;
  if (input.currentClassification === "LOW" && ctrHealthy) {
    reasoning.push(
      `Okupansi masih LOW dan performa iklan sehat (CTR ${input.insights.ctrPercent}% >= ambang sehat ${MIN_HEALTHY_CTR_PERCENT}%) -- layak ditambah budget untuk mempercepat pengisian.`,
    );
    return { decision: "SCALE", reasoning, cpcIdr, previousCpcIdr };
  }

  // 4. MAINTAIN -- default: nothing urgent, no clear upside to changing budget.
  if (input.currentClassification === "LOW" && !ctrHealthy) {
    reasoning.push(`Okupansi masih LOW tapi CTR ${input.insights.ctrPercent}% di bawah ambang sehat ${MIN_HEALTHY_CTR_PERCENT}% -- pertahankan budget, jangan tambah dulu sampai performa membaik.`);
  } else {
    reasoning.push(`Okupansi HEALTHY dan performa tidak menunjukkan masalah -- pertahankan budget saat ini.`);
  }
  return { decision: "MAINTAIN", reasoning, cpcIdr, previousCpcIdr };
}
