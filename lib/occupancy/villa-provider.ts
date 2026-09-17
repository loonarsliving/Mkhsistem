import "server-only";

import { logger } from "@/lib/logger";
import { saveIntegrationLog } from "@/lib/ai/integration-log";
import type { OccupancyDay, OccupancyProvider, ProviderResult, RoomTypeAvailability, TodayOccupancySnapshot } from "./types";

/**
 * villa-api Occupancy Provider — Loonars AI Occupancy Ads' one concrete
 * OccupancyProvider implementation. GET only, absolutely no POST/PUT/PATCH/
 * DELETE to villa-api from this codebase (read-only per the module's hard
 * constraint). Every call is logged through ai_integration_logs (connector
 * 'villa'), mirroring lib/meta/client.ts's telemetry pattern.
 *
 * PRIMARY source: GET /public/availability?checkin=...&checkout=...
 * — no authentication required, forward-looking, no data-quality caveat.
 * SECONDARY source: GET /bridge/occupancy (header x-internal-secret,
 * VILLA_BRIDGE_SECRET) — today-only, carries the known denominator caveat
 * (see TodayOccupancySnapshot.okupansiPersenRaw doc comment).
 *
 * If villa-api is unreachable or errors, every method here returns
 * { ok: false, reason } — never fabricated/estimated numbers. Any AI
 * automation depending on this must pause and say so (spec §43), not
 * silently use stale/fake data.
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";
const REQUEST_TIMEOUT_MS = 15_000;

interface PublicAvailabilityResponse {
  checkin: string;
  checkout: string;
  available: boolean;
  room_types: {
    code: string;
    name: string;
    total: number;
    available: number;
    nights: number;
    price_total?: number;
    price_per_night_avg?: number;
  }[];
}

async function villaGet<T>(path: string, headers?: Record<string, string>): Promise<ProviderResult<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${VILLA_API_BASE}${path}`, { method: "GET", headers, signal: controller.signal });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const reason =
      err instanceof Error && err.name === "AbortError"
        ? `villa-api tidak merespon dalam ${REQUEST_TIMEOUT_MS / 1000} detik (${path})`
        : `Gagal menghubungi villa-api: ${err instanceof Error ? err.message : String(err)}`;
    await saveIntegrationLog({ connector: "villa", direction: "outgoing", payload: { path, method: "GET" }, status: "error", error: reason, latencyMs });
    logger.error("villa-provider: villa-api tidak bisa dihubungi", { path, reason });
    return { ok: false, reason };
  } finally {
    clearTimeout(timeout);
  }

  const latencyMs = Date.now() - startedAt;
  const json = (await response.json().catch(() => null)) as T | null;

  if (!response.ok || json === null) {
    const reason = `villa-api mengembalikan HTTP ${response.status} untuk ${path}`;
    await saveIntegrationLog({
      connector: "villa",
      direction: "outgoing",
      payload: { path, method: "GET" },
      status: "error",
      responseStatus: response.status,
      error: reason,
      latencyMs,
    });
    return { ok: false, reason };
  }

  await saveIntegrationLog({ connector: "villa", direction: "outgoing", payload: { path, method: "GET" }, status: "success", responseStatus: response.status, latencyMs });
  return { ok: true, data: json };
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

/** occupied = total - available per room_type, for one specific date (checkin=date, checkout=date+1 -- a single-night query so the resulting figure is genuinely per-date, not a range average). */
async function fetchOneDayAvailability(date: string, roomTypeCode?: string): Promise<ProviderResult<RoomTypeAvailability[]>> {
  const checkout = addDays(date, 1);
  const qs = new URLSearchParams({ checkin: date, checkout });
  if (roomTypeCode) qs.set("room_type", roomTypeCode);

  const result = await villaGet<PublicAvailabilityResponse>(`/public/availability?${qs.toString()}`);
  if (!result.ok) return result;

  const roomTypes = (result.data.room_types ?? []).map((rt) => ({
    code: rt.code,
    name: rt.name,
    total: rt.total,
    available: rt.available,
    nights: rt.nights,
    pricePerNightAvg: typeof rt.price_per_night_avg === "number" ? rt.price_per_night_avg : null,
  }));
  return { ok: true, data: roomTypes };
}

class VillaOccupancyProvider implements OccupancyProvider {
  /**
   * villa-api's availability endpoint answers one checkin/checkout pair at
   * a time, not a date range calendar -- so this calls it once per date in
   * [startDate, endDateExclusive). Sequential, not Promise.all, to stay a
   * polite GET-only caller against a shared edge function rather than
   * bursting N concurrent requests.
   *
   * If ANY single day's call fails, the whole result is { ok: false } --
   * a partial calendar with silently-missing days is exactly the kind of
   * "stale/fake" data this module must never hand to the AI engine or UI
   * as if it were complete.
   */
  async getForwardAvailability(startDate: string, endDateExclusive: string, roomTypeCode?: string): Promise<ProviderResult<OccupancyDay[]>> {
    const dates: string[] = [];
    for (let d = startDate; d < endDateExclusive; d = addDays(d, 1)) {
      dates.push(d);
      if (dates.length > 120) break; // sanity cap -- this module's horizon is weeks, never years
    }
    if (dates.length === 0) return { ok: false, reason: "Rentang tanggal kosong atau tidak valid" };

    const days: OccupancyDay[] = [];
    for (const date of dates) {
      const result = await fetchOneDayAvailability(date, roomTypeCode);
      if (!result.ok) {
        return { ok: false, reason: `Gagal mengambil data okupansi tanggal ${date}: ${result.reason}` };
      }
      for (const rt of result.data) {
        const occupied = Math.max(0, rt.total - rt.available);
        days.push({
          date,
          roomTypeCode: rt.code,
          roomTypeName: rt.name,
          totalUnits: rt.total,
          availableUnits: rt.available,
          occupiedUnits: occupied,
          occupancyPct: rt.total > 0 ? Math.round((occupied / rt.total) * 1000) / 10 : 0,
        });
      }
    }
    return { ok: true, data: days };
  }

  async getTodaySnapshot(): Promise<ProviderResult<TodayOccupancySnapshot>> {
    const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
    if (!secret) {
      return { ok: false, reason: "VILLA_BRIDGE_SECRET belum dikonfigurasi -- snapshot hari-ini (bridge) tidak tersedia. Kalender ke depan (public/availability) tetap tersedia tanpa ini." };
    }

    const result = await villaGet<{
      tanggal: string;
      total: number;
      terisi: number;
      kosong: number;
      kotor: number;
      checkin_hari_ini: number;
      checkout_hari_ini: number;
      okupansi_persen: number;
    }>("/bridge/occupancy", { "x-internal-secret": secret });
    if (!result.ok) return result;

    return {
      ok: true,
      data: {
        tanggal: result.data.tanggal,
        total: result.data.total,
        terisi: result.data.terisi,
        kosong: result.data.kosong,
        kotor: result.data.kotor,
        checkinHariIni: result.data.checkin_hari_ini,
        checkoutHariIni: result.data.checkout_hari_ini,
        okupansiPersenRaw: result.data.okupansi_persen,
      },
    };
  }
}

let cachedProvider: VillaOccupancyProvider | null = null;

/** The rest of the system depends on this factory / the OccupancyProvider interface, never on VillaOccupancyProvider directly. */
export function getOccupancyProvider(): OccupancyProvider {
  if (!cachedProvider) cachedProvider = new VillaOccupancyProvider();
  return cachedProvider;
}
