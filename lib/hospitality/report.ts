/**
 * Hospitality Report Card -- pure consolidation (Loonars Connect, 0291).
 *
 * Every number here is computed in code from source records, never by a
 * model and never copied from chat text. Rules this file must keep:
 *   - A source that failed to load makes its metrics `value: null` with the
 *     reason. It is NEVER treated as zero.
 *   - "No report submitted" is listed as missing, never read as "all fine".
 *   - Physical readiness (unit status + villa maintenance), current occupancy
 *     (unit status / in-house bookings) and completed check-ins/outs in the
 *     window are separate metrics with separate sources.
 * No I/O here; lib/hospitality/report-generator.ts gathers the inputs.
 */

import { CHECKLIST_TITLES, type ChecklistKind } from "./checklists";
import { addDays, localParts, parseHHmm, zonedToUtc } from "./time";

export type PeriodKind = "morning" | "afternoon" | "end_of_day" | "manual";
export const SCHEDULED_PERIODS = ["morning", "afternoon", "end_of_day"] as const;

export const PERIOD_LABELS: Record<PeriodKind, string> = {
  morning: "Pagi",
  afternoon: "Siang",
  end_of_day: "Akhir Hari",
  manual: "Sesuai Permintaan",
};

export type SourceResult<T> = { ok: true; fetchedAt: string; data: T } | { ok: false; error: string };

export interface RequiredReport {
  kind: ChecklistKind;
  min_per_day: number;
  due_after: string;
}

export interface DepartmentSettings {
  report_times?: Partial<Record<"morning" | "afternoon" | "end_of_day", string>>;
  required_reports?: RequiredReport[];
  stale_data_minutes?: number;
}

export interface UnitRow {
  id: string;
  nomor: string;
  status: string;
}
export interface MaintenanceRow {
  unit_id: string;
  from: string;
  to: string;
  reason: string | null;
}
export interface BookingFacts {
  in_house_unit_ids: string[];
  checkins: string[];
  checkouts: string[];
}
export type JobHealth = Record<string, { last_run: string | null; status: string | null }>;

export interface TaskRow {
  id: string;
  unit_nomor: string;
  unit_id: string | null;
  status: string;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  target_at: string | null;
  completed_at: string | null;
  completion_source: string | null;
  conflict_note: string | null;
  blocked_reason: string | null;
}
export interface IssueRow {
  id: string;
  code: string;
  title: string;
  category: string;
  severity: string;
  status: string;
  unit_nomor: string | null;
  assigned_to: string | null;
  reporter_id: string;
  created_at: string;
  updated_at: string;
  target_at: string | null;
  escalated_at: string | null;
  resolved_at: string | null;
}
export interface ChecklistRow {
  kind: ChecklistKind;
  result: string;
  submitted_at: string;
}
export interface PastReportRow {
  report_date: string;
  period_kind: PeriodKind;
  status: string;
  error: string | null;
  attempts: number;
}

export interface ReportInputs {
  departmentCode: string;
  periodKind: PeriodKind;
  reportDate: string;
  timezone: string;
  now: Date;
  window: { from: string; to: string };
  settings: DepartmentSettings;
  /** ISO time the department was created; scheduled periods before it are never "missed". */
  departmentCreatedAt: string;
  units: SourceResult<UnitRow[]>;
  maintenance: SourceResult<MaintenanceRow[]>;
  bookings: SourceResult<BookingFacts>;
  jobs: SourceResult<JobHealth>;
  tasks: SourceResult<TaskRow[]>;
  issues: SourceResult<IssueRow[]>;
  checklists: SourceResult<ChecklistRow[]>;
  pastReports: SourceResult<PastReportRow[]>;
  /** employee id -> display name */
  people: Record<string, string>;
}

export interface Metric {
  value: number | null;
  source: string;
  note?: string;
}

export interface AccountabilityItem {
  ref: "issue" | "room_task";
  id: string;
  label: string;
  title: string;
  severity: string | null;
  responsible: string | null;
  status: string;
  ageHours: number;
  targetAt: string | null;
  overdue: boolean;
  latestUpdate: string;
  nextAction: string;
}

export interface HospitalityReportData {
  version: 1;
  departmentCode: string;
  periodKind: PeriodKind;
  reportDate: string;
  timezone: string;
  generatedAt: string;
  window: { from: string; to: string };
  metrics: {
    totalUnits: Metric;
    readyForSale: Metric;
    occupied: Metric;
    notReady: Metric;
    inMaintenance: Metric;
    checkinsCompleted: Metric;
    checkoutsCompleted: Metric;
    openRoomTasks: Metric;
    overdueTasks: Metric;
    openIssues: Metric;
    missingReports: Metric;
  };
  exceptions: {
    criticalIncidents: AccountabilityItem[];
    guestComplaints: AccountabilityItem[];
    unavailableRooms: { unit: string; reason: string }[];
    overdueItems: AccountabilityItem[];
    incompleteChecklists: { unit: string; status: string; since: string }[];
    missingVerification: { unit: string; completedAt: string | null }[];
    missingReports: { kind: ChecklistKind; label: string; expected: number; submitted: number }[];
    conflicts: string[];
    failedSources: { source: string; error: string }[];
    staleSources: { source: string; lastRun: string | null }[];
    failedReports: { date: string; periodKind: PeriodKind; error: string | null }[];
    unassignedIssues: AccountabilityItem[];
  };
  accountability: AccountabilityItem[];
  revenue: { included: false; note: string };
  caveats: string[];
}

const SOURCE = {
  units: "Sistem villa: units.status",
  maintenance: "Sistem villa: Kamar Maintenance",
  bookings: "Sistem villa: bookings (check-in/out)",
  tasks: "Loonars Connect: tugas kamar",
  issues: "Loonars Connect: masalah & insiden",
  checklists: "Loonars Connect: checklist staf",
};

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function hoursBetween(fromIso: string, to: Date): number {
  return Math.max(0, Math.round(((to.getTime() - Date.parse(fromIso)) / 3_600_000) * 10) / 10);
}

function unavailable(source: string, result: { ok: false; error: string }): Metric {
  return { value: null, source, note: `Data tidak tersedia: ${result.error}` };
}

const TASK_NEXT_ACTION: Record<string, string> = {
  pending: "Cleaning mulai membersihkan",
  in_progress: "Cleaning kirim checklist",
  awaiting_inspection: "FO periksa kamar",
  blocked: "Hospitality Manager tangani kendala",
};

function issueNextAction(issue: IssueRow): string {
  if (!issue.assigned_to) return "Tentukan penanggung jawab";
  if (issue.status === "open") return "Penanggung jawab mulai menangani";
  return "Selesaikan & tulis catatan penyelesaian";
}

/** Window of a report: morning = since last night's end-of-day time, afternoon = since this morning, end-of-day/manual = the whole local day so far. */
export function reportWindow(
  periodKind: PeriodKind,
  reportDate: string,
  settings: DepartmentSettings,
  timezone: string,
  now: Date,
): { from: string; to: string } {
  const times = settings.report_times ?? {};
  let from: Date;
  if (periodKind === "morning") {
    from = zonedToUtc(addDays(reportDate, -1), times.end_of_day ?? "21:00", timezone);
  } else if (periodKind === "afternoon") {
    from = zonedToUtc(reportDate, times.morning ?? "08:00", timezone);
  } else {
    from = zonedToUtc(reportDate, "00:00", timezone);
  }
  return { from: from.toISOString(), to: now.toISOString() };
}

/**
 * Scheduled periods that are due now: their local time has passed today and
 * they are at most `catchUpHours` late (a report generated hours after its
 * slot would present late data under the wrong label -- it is reported as
 * missed instead).
 */
export function duePeriods(
  settings: DepartmentSettings,
  timezone: string,
  now: Date,
  catchUpHours = 3,
): { periodKind: (typeof SCHEDULED_PERIODS)[number]; reportDate: string }[] {
  const local = localParts(now, timezone);
  const due: { periodKind: (typeof SCHEDULED_PERIODS)[number]; reportDate: string }[] = [];
  for (const kind of SCHEDULED_PERIODS) {
    const at = parseHHmm(settings.report_times?.[kind]);
    if (at === null) continue;
    const lateBy = local.minutes - at;
    if (lateBy >= 0 && lateBy <= catchUpHours * 60) due.push({ periodKind: kind, reportDate: local.date });
    // A late slot (e.g. 23:00) whose catch-up window crosses midnight.
    if (lateBy < 0 && 24 * 60 + lateBy <= catchUpHours * 60) due.push({ periodKind: kind, reportDate: addDays(local.date, -1) });
  }
  return due;
}

export function computeHospitalityReport(input: ReportInputs): HospitalityReportData {
  const { now } = input;
  const nowIso = now.toISOString();
  const name = (id: string | null) => (id ? (input.people[id] ?? "(tidak dikenal)") : null);
  const failedSources: { source: string; error: string }[] = [];
  const conflicts: string[] = [];
  const caveats: string[] = [
    "Blok kamar yang dibuat langsung di Cloudbeds tidak terbaca dari database; kesiapan dihitung dari status unit + Kamar Maintenance sistem villa.",
  ];

  for (const [key, label] of [
    ["units", SOURCE.units],
    ["maintenance", SOURCE.maintenance],
    ["bookings", SOURCE.bookings],
    ["tasks", SOURCE.tasks],
    ["issues", SOURCE.issues],
    ["checklists", SOURCE.checklists],
    ["jobs", "Status job sinkronisasi"],
    ["pastReports", "Riwayat laporan"],
  ] as const) {
    const r = input[key];
    if (!r.ok) failedSources.push({ source: label, error: r.error });
  }

  // ---- Rooms (villa authoritative) ----
  const units = input.units;
  const maintenance = input.maintenance;
  const maintenanceIds = maintenance.ok ? new Set(maintenance.data.map((m) => m.unit_id)) : null;

  const totalUnits: Metric = units.ok ? { value: units.data.length, source: SOURCE.units } : unavailable(SOURCE.units, units);
  const occupied: Metric = units.ok
    ? { value: units.data.filter((u) => u.status === "occupied").length, source: SOURCE.units }
    : unavailable(SOURCE.units, units);
  const inMaintenance: Metric = maintenance.ok
    ? { value: maintenance.data.length, source: SOURCE.maintenance }
    : unavailable(SOURCE.maintenance, maintenance);

  let readyForSale: Metric;
  let notReady: Metric;
  const unavailableRooms: { unit: string; reason: string }[] = [];
  if (!units.ok) {
    readyForSale = unavailable(SOURCE.units, units);
    notReady = unavailable(SOURCE.units, units);
  } else if (!maintenance.ok || !maintenanceIds) {
    readyForSale = unavailable(SOURCE.maintenance, maintenance as { ok: false; error: string });
    notReady = unavailable(SOURCE.maintenance, maintenance as { ok: false; error: string });
  } else {
    let ready = 0;
    let nr = 0;
    for (const u of units.data) {
      const closed = maintenanceIds.has(u.id);
      if (u.status === "available" && !closed) ready += 1;
      else if (u.status !== "occupied") {
        nr += 1;
        const m = maintenance.data.find((x) => x.unit_id === u.id);
        unavailableRooms.push({
          unit: u.nomor,
          reason: closed ? `Maintenance ${m?.from} s/d ${m?.to}${m?.reason ? `: ${m.reason}` : ""}` : u.status === "dirty" ? "Belum dibersihkan / belum diverifikasi" : `Status: ${u.status}`,
        });
      }
    }
    readyForSale = { value: ready, source: `${SOURCE.units} + ${SOURCE.maintenance}`, note: "Kesiapan fisik, bukan ketersediaan reservasi" };
    notReady = { value: nr, source: `${SOURCE.units} + ${SOURCE.maintenance}` };
  }

  const bookings = input.bookings;
  const checkinsCompleted: Metric = bookings.ok
    ? { value: bookings.data.checkins.length, source: SOURCE.bookings, note: "Check-in yang tercatat di jendela laporan" }
    : unavailable(SOURCE.bookings, bookings);
  const checkoutsCompleted: Metric = bookings.ok
    ? { value: bookings.data.checkouts.length, source: SOURCE.bookings, note: "Check-out yang tercatat di jendela laporan" }
    : unavailable(SOURCE.bookings, bookings);

  // Occupancy cross-check between unit status and in-house bookings.
  if (units.ok && bookings.ok) {
    const inHouse = new Set(bookings.data.in_house_unit_ids);
    for (const u of units.data) {
      if (u.status === "occupied" && !inHouse.has(u.id)) conflicts.push(`Unit ${u.nomor} berstatus terisi tetapi tidak ada booking check-in aktif`);
      if (inHouse.has(u.id) && u.status !== "occupied") conflicts.push(`Unit ${u.nomor} punya booking check-in aktif tetapi status unit "${u.status}"`);
    }
  }

  // ---- Tasks ----
  const tasks = input.tasks;
  const openTasks = tasks.ok ? tasks.data.filter((t) => t.status !== "completed" && t.status !== "cancelled") : [];
  const taskItems: AccountabilityItem[] = openTasks.map((t) => ({
    ref: "room_task",
    id: t.id,
    label: `Unit ${t.unit_nomor}`,
    title: t.status === "blocked" && t.blocked_reason ? `Kebersihan kamar — ${t.blocked_reason}` : "Kebersihan & kesiapan kamar",
    severity: null,
    responsible: name(t.assigned_to),
    status: t.status,
    ageHours: hoursBetween(t.created_at, now),
    targetAt: t.target_at,
    overdue: !!t.target_at && Date.parse(t.target_at) < now.getTime(),
    latestUpdate: t.updated_at,
    nextAction: TASK_NEXT_ACTION[t.status] ?? "-",
  }));
  for (const t of openTasks) if (t.conflict_note) conflicts.push(`Unit ${t.unit_nomor}: ${t.conflict_note}`);
  if (units.ok && tasks.ok) {
    const tracked = new Set(openTasks.map((t) => t.unit_id));
    for (const u of units.data) {
      if (u.status === "dirty" && !tracked.has(u.id)) conflicts.push(`Unit ${u.nomor} berstatus kotor tetapi tidak punya tugas kebersihan aktif`);
    }
  }
  const openRoomTasks: Metric = tasks.ok ? { value: openTasks.length, source: SOURCE.tasks } : unavailable(SOURCE.tasks, tasks);
  const incompleteChecklists = openTasks
    .filter((t) => t.status === "in_progress" || t.status === "awaiting_inspection" || t.status === "blocked")
    .map((t) => ({ unit: t.unit_nomor, status: t.status, since: t.updated_at }));
  const windowFrom = Date.parse(input.window.from);
  const missingVerification = tasks.ok
    ? tasks.data
        .filter((t) => t.completion_source === "villa_app" && t.completed_at && Date.parse(t.completed_at) >= windowFrom)
        .map((t) => ({ unit: t.unit_nomor, completedAt: t.completed_at }))
    : [];

  // ---- Issues ----
  const issues = input.issues;
  const openIssueRows = issues.ok ? issues.data.filter((i) => i.status === "open" || i.status === "in_progress") : [];
  const toItem = (i: IssueRow): AccountabilityItem => ({
    ref: "issue",
    id: i.id,
    label: i.code,
    title: `${i.title}${i.unit_nomor ? ` (unit ${i.unit_nomor})` : ""}`,
    severity: i.severity,
    responsible: name(i.assigned_to),
    status: i.status,
    ageHours: hoursBetween(i.created_at, now),
    targetAt: i.target_at,
    overdue: !!i.target_at && Date.parse(i.target_at) < now.getTime() && (i.status === "open" || i.status === "in_progress"),
    latestUpdate: i.updated_at,
    nextAction: issueNextAction(i),
  });
  const issueItems = openIssueRows.map(toItem);
  const openIssues: Metric = issues.ok ? { value: openIssueRows.length, source: SOURCE.issues } : unavailable(SOURCE.issues, issues);
  // Critical: still open, or escalated within this window (even if already closed).
  const criticalIncidents = issues.ok
    ? issues.data
        .filter((i) => i.severity === "critical" && (i.status === "open" || i.status === "in_progress" || (i.escalated_at && Date.parse(i.escalated_at) >= windowFrom)))
        .map(toItem)
    : [];
  const guestComplaints = issueItems.filter((i) => openIssueRows.find((r) => r.id === i.id)?.category === "guest_complaint");
  const unassignedIssues = issueItems.filter((i) => !i.responsible);

  const accountability = [...issueItems, ...taskItems].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const sa = SEVERITY_RANK[a.severity ?? "medium"] ?? 2;
    const sb = SEVERITY_RANK[b.severity ?? "medium"] ?? 2;
    if (sa !== sb) return sa - sb;
    return b.ageHours - a.ageHours;
  });
  const overdueItems = accountability.filter((a) => a.overdue);
  const overdueTasks: Metric = tasks.ok ? { value: taskItems.filter((t) => t.overdue).length, source: SOURCE.tasks } : unavailable(SOURCE.tasks, tasks);

  // ---- Required staff reports ----
  const missingReportsList: { kind: ChecklistKind; label: string; expected: number; submitted: number }[] = [];
  let missingReports: Metric;
  if (!input.checklists.ok) {
    missingReports = unavailable(SOURCE.checklists, input.checklists);
  } else {
    const local = localParts(now, input.timezone);
    const isPastDay = input.reportDate < local.date;
    for (const req of input.settings.required_reports ?? []) {
      const dueAt = parseHHmm(req.due_after) ?? 0;
      if (!isPastDay && local.minutes < dueAt) continue; // not due yet today
      const submitted = input.checklists.data.filter((c) => c.kind === req.kind).length;
      if (submitted < req.min_per_day) {
        missingReportsList.push({ kind: req.kind, label: CHECKLIST_TITLES[req.kind] ?? req.kind, expected: req.min_per_day, submitted });
      }
    }
    missingReports = { value: missingReportsList.length, source: SOURCE.checklists, note: "Laporan wajib yang sudah lewat jam tenggat" };
  }

  // ---- Integration freshness + earlier report failures ----
  const staleSources: { source: string; lastRun: string | null }[] = [];
  if (input.jobs.ok) {
    const staleMs = (input.settings.stale_data_minutes ?? 30) * 60_000;
    const watch: Record<string, { label: string; maxAgeMs: number }> = {
      "villa-sync-cloudbeds-reservations": { label: "Sinkronisasi reservasi Cloudbeds", maxAgeMs: staleMs },
      "hospitality-sync-room-tasks": { label: "Sinkronisasi tugas kamar", maxAgeMs: staleMs },
    };
    for (const [job, { label, maxAgeMs }] of Object.entries(watch)) {
      const h = input.jobs.data[job];
      if (!h || !h.last_run) {
        staleSources.push({ source: label, lastRun: null });
      } else if (h.status === "failed") {
        failedSources.push({ source: label, error: "Run terakhir gagal" });
      } else if (now.getTime() - Date.parse(h.last_run) > maxAgeMs) {
        staleSources.push({ source: label, lastRun: h.last_run });
      }
    }
  }

  const failedReports: { date: string; periodKind: PeriodKind; error: string | null }[] = [];
  if (input.pastReports.ok) {
    const local = localParts(now, input.timezone);
    const created = Date.parse(input.departmentCreatedAt);
    const rows = input.pastReports.data;
    for (const r of rows) {
      if (r.status === "failed") failedReports.push({ date: r.report_date, periodKind: r.period_kind, error: r.error });
    }
    // Scheduled slots earlier today (and last night) with no row at all.
    const slots: { date: string; kind: (typeof SCHEDULED_PERIODS)[number] }[] = [
      { date: addDays(local.date, -1), kind: "end_of_day" },
      ...SCHEDULED_PERIODS.map((kind) => ({ date: local.date, kind })),
    ];
    for (const slot of slots) {
      const t = parseHHmm(input.settings.report_times?.[slot.kind]);
      if (t === null) continue;
      const at = zonedToUtc(slot.date, input.settings.report_times![slot.kind]!, input.timezone).getTime();
      // only slots whose catch-up window (3h) is over, after the department existed, and not this report itself
      if (at + 3 * 3_600_000 > now.getTime() || at < created) continue;
      if (slot.date === input.reportDate && slot.kind === input.periodKind) continue;
      if (!rows.some((r) => r.report_date === slot.date && r.period_kind === slot.kind)) {
        failedReports.push({ date: slot.date, periodKind: slot.kind, error: "Tidak terbuat pada jadwalnya" });
      }
    }
  }

  return {
    version: 1,
    departmentCode: input.departmentCode,
    periodKind: input.periodKind,
    reportDate: input.reportDate,
    timezone: input.timezone,
    generatedAt: nowIso,
    window: input.window,
    metrics: {
      totalUnits,
      readyForSale,
      occupied,
      notReady,
      inMaintenance,
      checkinsCompleted,
      checkoutsCompleted,
      openRoomTasks,
      overdueTasks,
      openIssues,
      missingReports,
    },
    exceptions: {
      criticalIncidents,
      guestComplaints,
      unavailableRooms,
      overdueItems,
      incompleteChecklists,
      missingVerification,
      missingReports: missingReportsList,
      conflicts,
      failedSources,
      staleSources,
      failedReports,
      unassignedIssues,
    },
    accountability,
    revenue: {
      included: false,
      note: "Pendapatan belum disertakan: definisi & periode pendapatan untuk laporan operasional belum disepakati (sumber resmi tetap halaman Finance villa).",
    },
    caveats,
  };
}

function fmt(m: Metric): string {
  return m.value === null ? "?" : String(m.value);
}

/** One-line headline shown on the card in the owner feed (and in the push notification). */
export function summarizeReport(data: HospitalityReportData): string {
  const m = data.metrics;
  const e = data.exceptions;
  const [y, mo, d] = data.reportDate.split("-");
  const parts = [
    `Laporan ${PERIOD_LABELS[data.periodKind]} ${d}-${mo}-${y}`,
    `Siap jual ${fmt(m.readyForSale)}/${fmt(m.totalUnits)}`,
    `Terisi ${fmt(m.occupied)}`,
    `Belum siap ${fmt(m.notReady)}`,
    `${fmt(m.openIssues)} masalah terbuka`,
  ];
  const flags: string[] = [];
  if (e.criticalIncidents.length) flags.push(`🚨 ${e.criticalIncidents.length} insiden kritis`);
  if (e.overdueItems.length) flags.push(`${e.overdueItems.length} lewat target`);
  if (e.missingReports.length) flags.push(`${e.missingReports.length} laporan staf belum masuk`);
  if (e.failedSources.length || e.staleSources.length) flags.push("⚠ ada data tidak tersedia");
  return [parts.join(" · "), flags.length ? flags.join(" · ") : null].filter(Boolean).join(" — ");
}
