import { describe, expect, it } from "vitest";

import {
  computeHospitalityReport,
  duePeriods,
  reportWindow,
  summarizeReport,
  type DepartmentSettings,
  type IssueRow,
  type ReportInputs,
  type TaskRow,
} from "@/lib/hospitality/report";
import { localParts, zonedToUtc } from "@/lib/hospitality/time";

const TZ = "Asia/Jakarta";
const settings: DepartmentSettings = {
  report_times: { morning: "08:00", afternoon: "14:00", end_of_day: "21:00" },
  required_reports: [
    { kind: "security_shift_start", min_per_day: 1, due_after: "09:00" },
    { kind: "security_shift_end", min_per_day: 1, due_after: "22:00" },
  ],
  stale_data_minutes: 30,
};
// 2026-10-23 15:00 WIB
const now = new Date("2026-10-23T08:00:00Z");
const ok = <T,>(data: T) => ({ ok: true as const, fetchedAt: now.toISOString(), data });
const fail = (error: string) => ({ ok: false as const, error });

function task(over: Partial<TaskRow>): TaskRow {
  return {
    id: "t1",
    unit_nomor: "A1",
    unit_id: "u1",
    status: "pending",
    assigned_to: null,
    created_at: "2026-10-23T05:00:00Z",
    updated_at: "2026-10-23T05:00:00Z",
    target_at: "2026-10-23T07:00:00Z",
    completed_at: null,
    completion_source: null,
    conflict_note: null,
    blocked_reason: null,
    ...over,
  };
}

function issue(over: Partial<IssueRow>): IssueRow {
  return {
    id: "i1",
    code: "HSP-0001",
    title: "AC bocor",
    category: "room",
    severity: "medium",
    status: "open",
    unit_nomor: "A2",
    assigned_to: null,
    reporter_id: "p-fo",
    created_at: "2026-10-23T01:00:00Z",
    updated_at: "2026-10-23T01:00:00Z",
    target_at: "2026-10-24T01:00:00Z",
    escalated_at: null,
    resolved_at: null,
    ...over,
  };
}

function inputs(over: Partial<ReportInputs> = {}): ReportInputs {
  return {
    departmentCode: "hospitality",
    periodKind: "afternoon",
    reportDate: "2026-10-23",
    timezone: TZ,
    now,
    window: { from: "2026-10-23T01:00:00Z", to: now.toISOString() },
    settings,
    departmentCreatedAt: "2026-10-01T00:00:00Z",
    units: ok([
      { id: "u1", nomor: "A1", status: "dirty" },
      { id: "u2", nomor: "A2", status: "available" },
      { id: "u3", nomor: "A3", status: "available" },
      { id: "u4", nomor: "B1", status: "occupied" },
    ]),
    maintenance: ok([{ unit_id: "u3", from: "2026-10-22", to: "2026-10-25", reason: "Pompa kolam" }]),
    bookings: ok({ in_house_unit_ids: ["u4"], checkins: ["B1"], checkouts: ["A1", "C2"] }),
    jobs: ok({
      "villa-sync-cloudbeds-reservations": { last_run: "2026-10-23T07:55:00Z", status: "succeeded" },
      "hospitality-sync-room-tasks": { last_run: "2026-10-23T07:58:00Z", status: "succeeded" },
    }),
    tasks: ok([task({})]),
    issues: ok([issue({})]),
    checklists: ok([{ kind: "security_shift_start", result: "ok", submitted_at: "2026-10-23T02:00:00Z" }]),
    pastReports: ok([{ report_date: "2026-10-23", period_kind: "morning", status: "success", error: null, attempts: 1 }]),
    people: { "p-fo": "FO Satu" },
    ...over,
  };
}

describe("computeHospitalityReport — metrics from authoritative sources", () => {
  it("separates physical readiness, occupancy and check-in/out movements", () => {
    const r = computeHospitalityReport(inputs());
    expect(r.metrics.totalUnits.value).toBe(4);
    // A2 only: A3 is available in units but closed by villa maintenance
    expect(r.metrics.readyForSale.value).toBe(1);
    expect(r.metrics.occupied.value).toBe(1);
    expect(r.metrics.notReady.value).toBe(2);
    expect(r.metrics.inMaintenance.value).toBe(1);
    expect(r.metrics.checkinsCompleted.value).toBe(1);
    expect(r.metrics.checkoutsCompleted.value).toBe(2);
    expect(r.exceptions.unavailableRooms.map((u) => u.unit)).toEqual(["A1", "A3"]);
  });

  it("never turns an unavailable source into zero", () => {
    const r = computeHospitalityReport(inputs({ units: fail("villa timeout"), bookings: fail("permission denied") }));
    expect(r.metrics.totalUnits.value).toBeNull();
    expect(r.metrics.readyForSale.value).toBeNull();
    expect(r.metrics.occupied.value).toBeNull();
    expect(r.metrics.checkinsCompleted.value).toBeNull();
    expect(r.metrics.totalUnits.note).toContain("villa timeout");
    expect(r.exceptions.failedSources.map((f) => f.error)).toEqual(expect.arrayContaining(["villa timeout", "permission denied"]));
    expect(summarizeReport(r)).toContain("Siap jual ?/?");
    expect(summarizeReport(r)).toContain("data tidak tersedia");
  });

  it("readiness is unavailable (not guessed) when maintenance data is missing", () => {
    const r = computeHospitalityReport(inputs({ maintenance: fail("relation does not exist") }));
    expect(r.metrics.readyForSale.value).toBeNull();
    expect(r.metrics.totalUnits.value).toBe(4);
  });

  it("flags overdue tasks and puts them first in accountability", () => {
    const r = computeHospitalityReport(inputs());
    expect(r.metrics.overdueTasks.value).toBe(1);
    expect(r.accountability[0]).toMatchObject({ ref: "room_task", label: "Unit A1", overdue: true, nextAction: "Cleaning mulai membersihkan" });
    expect(r.exceptions.unassignedIssues.map((i) => i.label)).toEqual(["HSP-0001"]);
  });

  it("reports missing staff reports only once they are due, and an empty day as missing (not fine)", () => {
    // 15:00: shift start (due 09:00) submitted, shift end (due 22:00) not yet due
    expect(computeHospitalityReport(inputs()).exceptions.missingReports).toEqual([]);
    const noReports = computeHospitalityReport(inputs({ checklists: ok([]) }));
    expect(noReports.exceptions.missingReports.map((m) => m.kind)).toEqual(["security_shift_start"]);
    expect(noReports.metrics.missingReports.value).toBe(1);
    // end of a past day: everything required is due
    const pastDay = computeHospitalityReport(inputs({ reportDate: "2026-10-22", checklists: ok([]) }));
    expect(pastDay.exceptions.missingReports.map((m) => m.kind)).toEqual(["security_shift_start", "security_shift_end"]);
  });

  it("detects conflicting records instead of picking one", () => {
    const r = computeHospitalityReport(
      inputs({
        units: ok([
          { id: "u1", nomor: "A1", status: "dirty" },
          { id: "u4", nomor: "B1", status: "occupied" },
          { id: "u5", nomor: "B2", status: "available" },
        ]),
        bookings: ok({ in_house_unit_ids: ["u5"], checkins: [], checkouts: [] }),
        tasks: ok([]),
      }),
    );
    expect(r.exceptions.conflicts).toEqual(
      expect.arrayContaining([
        expect.stringContaining("B1 berstatus terisi"),
        expect.stringContaining('B2 punya booking check-in aktif tetapi status unit "available"'),
        expect.stringContaining("A1 berstatus kotor tetapi tidak punya tugas"),
      ]),
    );
  });

  it("surfaces rooms released in the villa app without FO verification", () => {
    const r = computeHospitalityReport(
      inputs({ tasks: ok([task({ status: "completed", completion_source: "villa_app", completed_at: "2026-10-23T04:00:00Z" })]) }),
    );
    expect(r.exceptions.missingVerification).toEqual([{ unit: "A1", completedAt: "2026-10-23T04:00:00Z" }]);
  });

  it("keeps a critical incident escalated in the window visible even after it was resolved", () => {
    const r = computeHospitalityReport(
      inputs({ issues: ok([issue({ severity: "critical", status: "resolved", escalated_at: "2026-10-23T03:00:00Z", resolved_at: "2026-10-23T04:00:00Z" })]) }),
    );
    expect(r.exceptions.criticalIncidents).toHaveLength(1);
    expect(r.metrics.openIssues.value).toBe(0);
  });

  it("flags stale or failed sync jobs", () => {
    const r = computeHospitalityReport(
      inputs({
        jobs: ok({
          "villa-sync-cloudbeds-reservations": { last_run: "2026-10-23T05:00:00Z", status: "succeeded" },
          "hospitality-sync-room-tasks": { last_run: "2026-10-23T07:59:00Z", status: "failed" },
        }),
      }),
    );
    expect(r.exceptions.staleSources.map((s) => s.source)).toEqual(["Sinkronisasi reservasi Cloudbeds"]);
    expect(r.exceptions.failedSources.map((s) => s.source)).toContain("Sinkronisasi tugas kamar");
  });

  it("lists failed and missed scheduled reports, but not slots before the department existed", () => {
    const r = computeHospitalityReport(
      inputs({ pastReports: ok([{ report_date: "2026-10-22", period_kind: "end_of_day", status: "failed", error: "timeout", attempts: 3 }]) }),
    );
    // last night's end_of_day failed; this morning's 08:00 slot never ran
    expect(r.exceptions.failedReports).toEqual(
      expect.arrayContaining([
        { date: "2026-10-22", periodKind: "end_of_day", error: "timeout" },
        { date: "2026-10-23", periodKind: "morning", error: "Tidak terbuat pada jadwalnya" },
      ]),
    );
    const fresh = computeHospitalityReport(inputs({ pastReports: ok([]), departmentCreatedAt: "2026-10-23T07:30:00Z" }));
    expect(fresh.exceptions.failedReports).toEqual([]);
  });

  it("excludes revenue explicitly instead of inventing a figure", () => {
    expect(computeHospitalityReport(inputs()).revenue.included).toBe(false);
  });
});

describe("report schedule", () => {
  it("converts WIB wall-clock to UTC", () => {
    expect(zonedToUtc("2026-10-23", "08:00", TZ).toISOString()).toBe("2026-10-23T01:00:00.000Z");
    expect(localParts(new Date("2026-10-23T17:30:00Z"), TZ)).toMatchObject({ date: "2026-10-24", time: "00:30" });
  });

  it("only schedules periods whose time has passed, within the catch-up window", () => {
    // 15:00 WIB: morning (08:00) is 7h late -> missed, afternoon (14:00) due
    expect(duePeriods(settings, TZ, now)).toEqual([{ periodKind: "afternoon", reportDate: "2026-10-23" }]);
    // 07:00 WIB: nothing due today
    expect(duePeriods(settings, TZ, new Date("2026-10-23T00:00:00Z"))).toEqual([]);
    // 21:10 WIB: end of day due
    expect(duePeriods(settings, TZ, new Date("2026-10-23T14:10:00Z"))).toEqual([{ periodKind: "end_of_day", reportDate: "2026-10-23" }]);
  });

  it("assigns a late-evening slot's after-midnight catch-up to the previous day", () => {
    const late: DepartmentSettings = { report_times: { end_of_day: "23:00" } };
    // 00:30 WIB on the 24th
    expect(duePeriods(late, TZ, new Date("2026-10-23T17:30:00Z"))).toEqual([{ periodKind: "end_of_day", reportDate: "2026-10-23" }]);
  });

  it("defines each period's window", () => {
    expect(reportWindow("morning", "2026-10-23", settings, TZ, now).from).toBe("2026-10-22T14:00:00.000Z");
    expect(reportWindow("afternoon", "2026-10-23", settings, TZ, now).from).toBe("2026-10-23T01:00:00.000Z");
    expect(reportWindow("end_of_day", "2026-10-23", settings, TZ, now).from).toBe("2026-10-22T17:00:00.000Z");
  });
});
