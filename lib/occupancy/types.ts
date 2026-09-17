/**
 * Loonars AI Occupancy Ads — shared types for the OccupancyProvider
 * abstraction and the pure-TS gap/classification engine.
 *
 * Kept deliberately provider-agnostic: everything downstream (the AI
 * engine, Server Actions, UI) depends on these shapes, never on villa-api
 * specifics directly. See lib/occupancy/villa-provider.ts for the one
 * concrete implementation today.
 */

/** One room_type row from villa-api's GET /public/availability, for one date range. */
export interface RoomTypeAvailability {
  code: string;
  name: string;
  total: number;
  available: number;
  /** Nights covered by the query this row came from — not itself a per-date figure. */
  nights: number;
  pricePerNightAvg: number | null;
}

/** One calendar day's occupancy, derived (never fabricated) from villa-api's forward availability. */
export interface OccupancyDay {
  date: string; // YYYY-MM-DD
  roomTypeCode: string;
  roomTypeName: string;
  totalUnits: number;
  availableUnits: number;
  occupiedUnits: number;
  occupancyPct: number; // 0-100, occupiedUnits / totalUnits, computed in code
}

/**
 * A provider call either succeeds with real data, or comes back
 * "unavailable" — it must never fabricate/estimate numbers when villa-api
 * is unreachable or errors (spec §43). Callers (the AI engine, UI) must
 * branch on `ok` and never proceed with stale/fake numbers when it's false.
 */
export type ProviderResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** Today-only snapshot from the optional, secret-gated /bridge/occupancy endpoint. */
export interface TodayOccupancySnapshot {
  tanggal: string;
  total: number;
  terisi: number;
  kosong: number;
  kotor: number;
  checkinHariIni: number;
  checkoutHariIni: number;
  /**
   * villa-api's own computed percentage. KNOWN DATA QUALITY CAVEAT (carried
   * from villa's own project memory): this divides by ALL units (13)
   * rather than the 8 actually offered for sale, over/under-stating real
   * occupancy by roughly a third. Never present this with the same trust
   * level as the /public/availability-derived numbers — always label it
   * "Today snapshot (villa-api bridge) — denominator may include unlisted
   * units, verify before acting" wherever it's shown.
   */
  okupansiPersenRaw: number;
}

export interface OccupancyProvider {
  /**
   * Forward-looking calendar built from villa-api's GET /public/availability,
   * called once per date in [startDate, endDate) (villa-api's availability
   * endpoint answers one checkin/checkout pair at a time, not a range) —
   * PRIMARY, authenticated-free, no data-quality caveat.
   */
  getForwardAvailability(startDate: string, endDateExclusive: string, roomTypeCode?: string): Promise<ProviderResult<OccupancyDay[]>>;

  /**
   * SECONDARY, optional — requires VILLA_BRIDGE_SECRET. Today only. Carries
   * the denominator caveat above. Returns { ok: false } (not a thrown
   * error) when the secret isn't configured, so callers can degrade
   * gracefully instead of crashing a page that doesn't strictly need it.
   */
  getTodaySnapshot(): Promise<ProviderResult<TodayOccupancySnapshot>>;
}
