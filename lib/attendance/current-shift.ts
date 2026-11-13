/**
 * Which attendance row the "Absensi Hari Ini" card should act on.
 *
 * Two real failure modes this fixes (seen on LPL Front Office & Security,
 * 2026-11):
 *  1. "Today" used to be the UTC date. Vercel runs in UTC, so between
 *     00:00-07:59 WITA the card showed *yesterday's* row: a morning check-in
 *     looked like it never happened, or a stale "Check Out" button appeared
 *     that the RPC (which uses the WITA date) then rejected.
 *  2. A shift that crosses midnight (security/FO night shift) is filed under
 *     the check-in date. After midnight there is no row for the new date, so
 *     the card offered "Check In" again and check-out was impossible.
 *
 * Rule: an open shift (checked in, not checked out) from an earlier date is
 * still the current shift while it is younger than OPEN_SHIFT_MAX_HOURS and
 * today has no check-in of its own. Same window as the
 * attendance_check_out RPC fallback (migration 0315) -- keep them equal.
 */

export const OPEN_SHIFT_MAX_HOURS = 14;
export const DEFAULT_COMPANY_TIMEZONE = "Asia/Makassar";

interface ShiftLike {
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
}

/** YYYY-MM-DD of `at` in `timeZone`. */
export function localDate(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isOpenShiftStillCurrent(row: ShiftLike, today: string, now: Date): boolean {
  if (row.attendance_date >= today) return false;
  if (!row.check_in_time || row.check_out_time) return false;
  const ageMs = now.getTime() - new Date(row.check_in_time).getTime();
  return ageMs >= 0 && ageMs <= OPEN_SHIFT_MAX_HOURS * 3_600_000;
}

/**
 * Today's row wins once it has a check-in; otherwise a still-current open
 * shift from an earlier date; otherwise today's row (possibly an empty
 * 'alpha'/izin row) or null.
 */
export function pickCurrentAttendance<T extends ShiftLike>(
  todayRow: T | null,
  latestOpenEarlier: T | null,
  today: string,
  now: Date,
): (T & { carried_over: boolean }) | null {
  if (todayRow?.check_in_time) return { ...todayRow, carried_over: false };
  if (latestOpenEarlier && isOpenShiftStillCurrent(latestOpenEarlier, today, now)) {
    return { ...latestOpenEarlier, carried_over: true };
  }
  return todayRow ? { ...todayRow, carried_over: false } : null;
}
