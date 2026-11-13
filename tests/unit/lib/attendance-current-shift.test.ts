import { describe, expect, it } from "vitest";

import { localDate, pickCurrentAttendance } from "@/lib/attendance/current-shift";

const TZ = "Asia/Makassar";
const row = (attendance_date: string, check_in_time: string | null, check_out_time: string | null = null) => ({
  attendance_date,
  check_in_time,
  check_out_time,
});

describe("localDate", () => {
  it("uses the company date, not UTC, before 08:00 WITA", () => {
    // 06:30 WITA on 13 Nov = 22:30 UTC on 12 Nov
    expect(localDate(new Date("2026-11-12T22:30:00Z"), TZ)).toBe("2026-11-13");
  });
});

describe("pickCurrentAttendance", () => {
  const today = "2026-11-13";

  it("keeps last night's open shift current so it can be checked out", () => {
    const now = new Date("2026-11-12T23:00:00Z"); // 07:00 WITA
    const open = row("2026-11-12", "2026-11-12T11:00:00Z"); // 19:00 WITA
    const picked = pickCurrentAttendance(null, open, today, now);
    expect(picked?.attendance_date).toBe("2026-11-12");
    expect(picked?.carried_over).toBe(true);
  });

  it("drops a forgotten open shift older than the window", () => {
    const now = new Date("2026-11-13T05:00:00Z"); // 13:00 WITA
    const open = row("2026-11-12", "2026-11-12T08:00:00Z"); // 21h ago
    expect(pickCurrentAttendance(null, open, today, now)).toBeNull();
  });

  it("prefers today's own check-in", () => {
    const now = new Date("2026-11-13T01:00:00Z");
    const mine = row(today, "2026-11-13T00:30:00Z");
    const open = row("2026-11-12", "2026-11-12T14:00:00Z");
    const picked = pickCurrentAttendance(mine, open, today, now);
    expect(picked?.attendance_date).toBe(today);
    expect(picked?.carried_over).toBe(false);
  });

  it("prefers the open shift over an empty alpha row for today", () => {
    const now = new Date("2026-11-12T23:00:00Z");
    const alpha = row(today, null);
    const open = row("2026-11-12", "2026-11-12T12:00:00Z");
    expect(pickCurrentAttendance(alpha, open, today, now)?.carried_over).toBe(true);
  });

  it("returns today's row when there is no open shift", () => {
    const now = new Date("2026-11-13T01:00:00Z");
    expect(pickCurrentAttendance(row(today, null), null, today, now)?.carried_over).toBe(false);
  });
});
