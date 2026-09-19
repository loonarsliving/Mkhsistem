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

/** Indonesian label for each persona -- used by the AI prompt's persona-matching hint and the "Ganti Persona" dropdown in the Meta Ad Preview UI. */
export const OCCUPANCY_PERSONA_LABELS: Record<OccupancyPersona, string> = {
  family_leisure_traveler: "Liburan Keluarga",
  weekend_couple_getaway: "Weekend Escape Pasangan",
  corporate_offsite_group: "Acara/Offsite Kantor",
  digital_nomad_long_stay: "Kerja Jarak Jauh (Long Stay)",
  student_group_gathering: "Gathering Grup/Mahasiswa",
  domestic_tourist_first_time: "Wisatawan Baru Pertama Kali",
};

/**
 * Which OCCUPANCY_ASSET_FIXED_TAGS best signal each persona -- fed into the
 * AI prompt so the brief's audience_persona is chosen to actually match
 * what the selected creative assets show (a couple-dining photo tagged
 * "couple"/"private pool" should not produce "digital_nomad_long_stay"
 * copy just because that persona happened to be picked before). Purely a
 * prompt hint, not a hard constraint -- the AI still picks from the full
 * OCCUPANCY_PERSONA_CANDIDATES list, this only steers it toward the
 * available visuals when there's a clear match.
 */
export const OCCUPANCY_PERSONA_TAG_HINTS: Record<OccupancyPersona, readonly string[]> = {
  family_leisure_traveler: ["family", "living room", "breakfast", "garden", "daytime"],
  weekend_couple_getaway: ["couple", "private pool", "night", "view", "lifestyle"],
  corporate_offsite_group: ["living room", "facility", "daytime"],
  digital_nomad_long_stay: ["facility", "living room", "daytime"],
  student_group_gathering: ["living room", "facility", "garden"],
  domestic_tourist_first_time: ["villa exterior", "view", "facility", "promo"],
};

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
 * Optional weekly spend ceiling, on top of the daily ceiling above (spec
 * follow-up: admin wants e.g. "max Rp1jt/minggu" in addition to a daily
 * cap). `maxWeeklyBudgetIdr` null/0 means no separate weekly cap is
 * configured -- only the daily ceiling applies, and this always allows.
 * `alreadyCommittedWeeklyIdr` is the sum of daily_budget_idr for every
 * OTHER campaign under the same target already 'active' this ISO week
 * (repositories/occupancy-ads.repository.ts's
 * getActiveWeeklyCommittedBudgetIdr) -- never the AI's own estimate.
 * Pure/deterministic so it's independently unit tested; the launch action
 * is the only caller and must refuse the launch (not silently clamp) when
 * this returns allowed: false, since silently shrinking a campaign's
 * budget mid-review would surprise the human who approved a specific
 * number.
 */
export function checkWeeklyBudgetCeiling(
  alreadyCommittedWeeklyIdr: number,
  newDailyBudgetIdr: number,
  maxWeeklyBudgetIdr: number | null,
): { allowed: boolean; wouldBeTotalIdr: number } {
  const committed = Number.isFinite(alreadyCommittedWeeklyIdr) && alreadyCommittedWeeklyIdr > 0 ? alreadyCommittedWeeklyIdr : 0;
  const addition = Number.isFinite(newDailyBudgetIdr) && newDailyBudgetIdr > 0 ? newDailyBudgetIdr : 0;
  const wouldBeTotalIdr = committed + addition;
  if (maxWeeklyBudgetIdr === null || !Number.isFinite(maxWeeklyBudgetIdr) || maxWeeklyBudgetIdr <= 0) {
    return { allowed: true, wouldBeTotalIdr };
  }
  return { allowed: wouldBeTotalIdr <= maxWeeklyBudgetIdr, wouldBeTotalIdr };
}

/**
 * Monday 00:00:00 UTC of the ISO week containing referenceDate -- the
 * window repositories/occupancy-ads.repository.ts's
 * getActiveWeeklyCommittedBudgetIdr sums 'active' campaigns' daily
 * budgets over. Pure/UTC so it's deterministic and independently unit
 * tested, no reliance on server-local timezone.
 */
export function startOfIsoWeekUtc(referenceDate: Date): Date {
  const d = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const isoDayOfWeek = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // Monday=1 .. Sunday=7
  d.setUTCDate(d.getUTCDate() - (isoDayOfWeek - 1));
  return d;
}

/**
 * Minimum-sample-size gate for loonars_campaign_learnings (spec) -- a
 * "learning" derived from fewer than this many completed campaigns for the
 * same market+persona+creative-angle combination must not be treated as a
 * reliable signal. Enforced here in code, not left as a docs-only note.
 */
export const MIN_LEARNING_SAMPLE_SIZE = 3;

/**
 * Pure gate function wrapping MIN_LEARNING_SAMPLE_SIZE -- the single place
 * that decides whether a market/persona/creative-angle combination's
 * historical outcomes are reliable enough to be handed to the AI as a
 * "this is a proven pattern" signal (repositories/occupancy-ads.repository.ts's
 * listReliableLearnings) or surfaced anywhere else as a "winner". Kept as
 * its own function (not just an inline `>=`) so it's independently unit
 * tested and so every future caller reads the SAME rule instead of
 * re-implementing the comparison.
 */
export function meetsMinLearningSampleSize(sampleSize: number): boolean {
  return Number.isFinite(sampleSize) && sampleSize >= MIN_LEARNING_SAMPLE_SIZE;
}

// ----------------------------------------------------------------------------
// Creative variants (spec: "1-3 creative variants, default 3, admin-
// configurable") -- fixed bounds the AI/Server Action must clamp any
// requested count into, never trusting a raw client-supplied number.
// ----------------------------------------------------------------------------
export const MIN_CREATIVE_VARIANT_COUNT = 1;
export const MAX_CREATIVE_VARIANT_COUNT = 3;
export const DEFAULT_CREATIVE_VARIANT_COUNT = 3;

/** Clamps any requested variant count into [MIN_CREATIVE_VARIANT_COUNT, MAX_CREATIVE_VARIANT_COUNT]. */
export function clampCreativeVariantCount(requested: number): number {
  if (!Number.isFinite(requested)) return DEFAULT_CREATIVE_VARIANT_COUNT;
  return Math.min(MAX_CREATIVE_VARIANT_COUNT, Math.max(MIN_CREATIVE_VARIANT_COUNT, Math.round(requested)));
}

/** Fixed tag vocabulary for the Creative Asset Library (spec) -- the UI offers these as one-click chips, plus a free-text field for custom tags on top of this list (never a replacement for it). */
export const OCCUPANCY_ASSET_FIXED_TAGS = [
  "villa exterior",
  "bedroom",
  "private pool",
  "bathroom",
  "living room",
  "family",
  "couple",
  "breakfast",
  "night",
  "daytime",
  "garden",
  "facility",
  "view",
  "promo",
  "lifestyle",
] as const;

// ----------------------------------------------------------------------------
// Campaign Decision Engine (spec §36) -- deterministic thresholds only, no
// AI arithmetic. lib/occupancy/decision-engine.ts is the pure function that
// consumes these; kept here alongside the module's other fixed guardrails.
// ----------------------------------------------------------------------------

/** Below this many available units across a campaign's target dates, inventory is "thin" -- REDUCE regardless of how well the ad is otherwise performing (don't advertise your way into an overselling risk). */
export const INVENTORY_THIN_AVAILABLE_UNITS_THRESHOLD = 2;

/** CAC/CPC counted as "worsening" once it rises by more than this fraction versus the previous recommendation's snapshot (e.g. 0.25 = +25%). */
export const CAC_WORSENING_THRESHOLD_FRACTION = 0.25;

/** Minimum CTR (%) counted as "healthy" performance for a SCALE decision -- below this, more budget on the same creative/targeting is unlikely to convert better, just spend faster. */
export const MIN_HEALTHY_CTR_PERCENT = 1.0;
