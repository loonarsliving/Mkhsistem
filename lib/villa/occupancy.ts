import "server-only";

/**
 * Villa daily occupancy summary, read through the file hub bridge — NOT
 * directly from the Villa app. Chain: this app → file hub
 * (/api/villa/occupancy, x-bridge-secret) → villa-api Edge Function
 * (/bridge/occupancy). Same philosophy as the file hub's api/holding.js:
 * each business keeps its own credentials, and this app only ever holds the
 * secret of its own pairing with the file hub (FILEHUB_BRIDGE_SECRET), never
 * Villa's. Contrast with Kos, which shares infrastructure closely enough to
 * be integrated at the database level via postgres_fdw (0146).
 */
export interface VillaDailyOccupancy {
  /** ISO date (YYYY-MM-DD) the summary describes — today in villa-api's clock. */
  tanggal: string;
  total: number;
  terisi: number;
  kosong: number;
  /** Units in post-checkout cleaning state ("dirty") — occupied by housekeeping, not guests. */
  kotor: number;
  checkinHariIni: number;
  checkoutHariIni: number;
  okupansiPersen: number;
}

export function isVillaBridgeConfigured(): boolean {
  return (process.env.FILEHUB_BRIDGE_SECRET ?? "").trim().length > 0;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

export async function getVillaDailyOccupancy(): Promise<VillaDailyOccupancy> {
  const secret = (process.env.FILEHUB_BRIDGE_SECRET ?? "").trim();
  if (!secret) throw new Error("FILEHUB_BRIDGE_SECRET belum disetel");
  const base = (process.env.FILEHUB_BRIDGE_URL || "https://filemanager.haluoleo.id").replace(/\/+$/, "");

  const response = await fetch(`${base}/api/villa/occupancy`, {
    headers: { "x-bridge-secret": secret },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await response.json().catch(() => null);
  const record = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  if (!response.ok || !record) {
    const detail = typeof record?.error === "string" ? record.error : `file hub membalas ${response.status}`;
    throw new Error(detail);
  }

  const total = asCount(record.total);
  const terisi = asCount(record.terisi);
  return {
    tanggal: typeof record.tanggal === "string" ? record.tanggal : new Date().toISOString().slice(0, 10),
    total,
    terisi,
    kosong: asCount(record.kosong),
    kotor: asCount(record.kotor),
    checkinHariIni: asCount(record.checkin_hari_ini),
    checkoutHariIni: asCount(record.checkout_hari_ini),
    okupansiPersen: typeof record.okupansi_persen === "number" && Number.isFinite(record.okupansi_persen)
      ? record.okupansi_persen
      : total > 0
        ? Math.round((terisi / total) * 100)
        : 0,
  };
}
