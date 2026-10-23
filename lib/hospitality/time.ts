/**
 * Timezone helpers for hospitality reports. Plain Intl, no dependency: the
 * department's IANA timezone (default Asia/Jakarta, the villa's own WIB) is
 * what "08:00 morning report" and "today" mean.
 */

export const DEFAULT_TIMEZONE = "Asia/Jakarta";

interface LocalParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  minutes: number; // minutes since local midnight
}

export function localParts(at: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  const time = `${hour}:${get("minute")}`;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time, minutes: Number(hour) * 60 + Number(get("minute")) };
}

/** Offset (ms) of `timeZone` from UTC at instant `at`. */
function offsetMs(at: Date, timeZone: string): number {
  const p = localParts(at, timeZone);
  const asUtc = Date.parse(`${p.date}T${p.time}:00Z`);
  return asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
}

/** The UTC instant of local wall-clock `date` + `time` (HH:mm) in `timeZone`. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  const first = new Date(guess.getTime() - offsetMs(guess, timeZone));
  // second pass corrects a DST boundary between guess and result
  return new Date(guess.getTime() - offsetMs(first, timeZone));
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseHHmm(value: string | undefined | null): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
