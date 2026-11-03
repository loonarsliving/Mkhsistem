/**
 * Iklan dengan durasi tetap + total budget (migrasi 0312), dipakai oleh Ads
 * Specialist (features/markom) dan Loonars AI Occupancy Ads
 * (features/occupancy-ads). Murni/tanpa I/O supaya bisa di-unit-test dan
 * dipakai di client (pratinjau budget harian) maupun server (validasi ulang).
 *
 * Angka budget harian selalu dihitung di sini, tidak pernah dipercaya dari
 * client -- server action memanggil parseCampaignSchedule lagi dengan input
 * mentah dari form.
 */

export const AD_DURATION_OPTIONS = [7, 14, 30] as const;
export type AdDurationDays = (typeof AD_DURATION_OPTIONS)[number];

/** Sama dengan batas minimal setAdCampaignBudgetAction (Ads Specialist). */
export const MIN_SCHEDULED_DAILY_BUDGET_IDR = 10_000;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CampaignScheduleInput {
  durationDays: number;
  totalBudgetIdr: number;
}

export interface CampaignSchedule {
  durationDays: AdDurationDays;
  totalBudgetIdr: number;
  /** total ÷ hari, dibulatkan ke bawah -- daily × hari tidak pernah melebihi total. */
  dailyBudgetIdr: number;
}

export function isAdDurationDays(value: number): value is AdDurationDays {
  return (AD_DURATION_OPTIONS as readonly number[]).includes(value);
}

export function dailyBudgetFromTotal(totalBudgetIdr: number, durationDays: number): number {
  if (!Number.isFinite(totalBudgetIdr) || totalBudgetIdr <= 0 || !Number.isFinite(durationDays) || durationDays <= 0) return 0;
  return Math.floor(totalBudgetIdr / durationDays);
}

/**
 * null/undefined = tanpa jadwal (perilaku lama: iklan berjalan terus).
 * Selain itu wajib durasi 7/14/30 dan total yang menghasilkan budget harian
 * minimal Rp10.000.
 */
export function parseCampaignSchedule(
  input: CampaignScheduleInput | null | undefined,
): { ok: true; schedule: CampaignSchedule | null } | { ok: false; error: string } {
  if (input == null) return { ok: true, schedule: null };
  if (!isAdDurationDays(input.durationDays)) return { ok: false, error: "Durasi iklan harus 7, 14, atau 30 hari" };
  const total = Math.floor(input.totalBudgetIdr);
  if (!Number.isFinite(total) || total <= 0) return { ok: false, error: "Total budget harus diisi" };
  const daily = dailyBudgetFromTotal(total, input.durationDays);
  if (daily < MIN_SCHEDULED_DAILY_BUDGET_IDR) {
    const minTotal = MIN_SCHEDULED_DAILY_BUDGET_IDR * input.durationDays;
    return {
      ok: false,
      error: `Total budget terlalu kecil: minimal Rp${minTotal.toLocaleString("id-ID")} untuk ${input.durationDays} hari (Rp${MIN_SCHEDULED_DAILY_BUDGET_IDR.toLocaleString("id-ID")}/hari)`,
    };
  }
  return { ok: true, schedule: { durationDays: input.durationDays, totalBudgetIdr: total, dailyBudgetIdr: daily } };
}

/** Waktu selesai = waktu peluncuran + N × 24 jam. Dikirim ke Meta sebagai end_time ad set. */
export function computeScheduleEnd(start: Date, durationDays: number): Date {
  return new Date(start.getTime() + durationDays * DAY_MS);
}

/** Sisa hari (dibulatkan ke atas) sampai ends_at; 0 bila sudah lewat. */
export function remainingScheduleDays(endsAt: string | Date, now: Date = new Date()): number {
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const diff = end.getTime() - now.getTime();
  if (!Number.isFinite(diff) || diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

export function isScheduleEnded(endsAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!endsAt) return false;
  return remainingScheduleDays(endsAt, now) === 0;
}

/** Meta Marketing API menerima end_time ad set sebagai UNIX timestamp (detik, UTC). */
export function toMetaUnixTimestamp(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}
