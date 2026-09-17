/**
 * Loonars AI Occupancy Ads — code-level campaign guardrails.
 *
 * Market candidates (spec §16), persona candidates (spec §17), and
 * campaign-type templates (spec §15) as fixed, code-defined sets the AI
 * selects FROM -- it never invents a market/persona/template outside
 * these lists. Also the destination-URL and budget-ceiling validators
 * used before any Meta launch call (spec §22/§43).
 */

export const OCCUPANCY_MARKET_CANDIDATES = [
  "Yogyakarta",
  "Jabodetabek",
  "Surabaya",
  "Bandung",
  "Bali",
  "Surakarta",
  "Semarang",
  "Malang",
] as const;
export type OccupancyMarket = (typeof OCCUPANCY_MARKET_CANDIDATES)[number];

export const OCCUPANCY_PERSONA_CANDIDATES = [
  "family_leisure_traveler",
  "weekend_couple_getaway",
  "corporate_offsite_group",
  "digital_nomad_long_stay",
  "student_group_gathering",
  "domestic_tourist_first_time",
] as const;
export type OccupancyPersona = (typeof OCCUPANCY_PERSONA_CANDIDATES)[number];

export const OCCUPANCY_CAMPAIGN_TYPES = ["last_minute_gap_fill", "weekend_boost", "seasonal_push", "long_stay_offer"] as const;
export type OccupancyCampaignType = (typeof OCCUPANCY_CAMPAIGN_TYPES)[number];

/** Fixed template guidance per campaign type -- fed into the AI prompt as candidate framing, never left to the model to invent the strategy from scratch. */
export const OCCUPANCY_CAMPAIGN_TYPE_TEMPLATES: Record<OccupancyCampaignType, { label: string; guidance: string; typicalDurationDays: number }> = {
  last_minute_gap_fill: {
    label: "Isi Gap Mendadak",
    guidance: "Untuk tanggal LOW dalam 7 hari ke depan -- urgensi tinggi, tawarkan diskon/insentif booking cepat, CTA langsung.",
    typicalDurationDays: 5,
  },
  weekend_boost: {
    label: "Dorong Akhir Pekan",
    guidance: "Untuk akhir pekan LOW yang masih 1-3 minggu ke depan -- angkat pengalaman menginap singkat/quality time, bukan diskon besar-besaran.",
    typicalDurationDays: 10,
  },
  seasonal_push: {
    label: "Dorong Musiman",
    guidance: "Untuk periode LOW musiman (di luar musim liburan) -- edukasi pasar tentang keunggulan properti di luar musim ramai, harga tetap kompetitif.",
    typicalDurationDays: 14,
  },
  long_stay_offer: {
    label: "Penawaran Menginap Lama",
    guidance: "Untuk rentang LOW yang panjang (>5 hari berturut-turut) -- targetkan digital nomad/grup, tawarkan harga per-malam lebih baik untuk menginap lebih lama.",
    typicalDurationDays: 21,
  },
};

/** Fixed destination -- launch must refuse anything else (spec §22/§43). */
export const OCCUPANCY_ADS_ALLOWED_DESTINATION_ORIGIN = "https://loonars.id";

/** Validates a destination URL is exactly https://loonars.id or a page under it -- never any other host/scheme. */
export function isAllowedOccupancyDestinationUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  if (parsed.hostname !== "loonars.id") return false;
  return true;
}

/**
 * Enforces the admin-configured daily budget ceiling in code -- never
 * trusted from the AI's own recommended_budget field. Returns the
 * clamped value; callers must use the return value, not the input, for
 * anything that actually reaches Meta.
 */
export function clampToBudgetCeiling(recommendedDailyBudgetIdr: number, maxDailyBudgetIdr: number): number {
  if (!Number.isFinite(recommendedDailyBudgetIdr) || recommendedDailyBudgetIdr < 0) return 0;
  if (!Number.isFinite(maxDailyBudgetIdr) || maxDailyBudgetIdr <= 0) return 0;
  return Math.min(recommendedDailyBudgetIdr, maxDailyBudgetIdr);
}

/**
 * Minimum-sample-size gate for loonars_campaign_learnings (spec) -- a
 * "learning" derived from fewer than this many completed campaigns for the
 * same market+persona+creative-angle combination must not be treated as a
 * reliable signal. Enforced here in code, not left as a docs-only note.
 */
export const MIN_LEARNING_SAMPLE_SIZE = 3;
