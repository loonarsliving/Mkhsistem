import "server-only";

import { generateConnectReport, isConnectDepartment } from "@/lib/connect/connect-report-generator";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database.types";

import {
  computeHospitalityReport,
  duePeriods,
  reportWindow,
  summarizeReport,
  type BookingFacts,
  type ChecklistRow,
  type DepartmentSettings,
  type IssueRow,
  type JobHealth,
  type MaintenanceRow,
  type PastReportRow,
  type PeriodKind,
  type SourceResult,
  type TaskRow,
  type UnitRow,
} from "./report";
import { addDays, DEFAULT_TIMEZONE, localParts } from "./time";

/**
 * Hospitality report generation (Loonars Connect, 0291). Runs with the
 * service role, called only from the cron dispatcher (CRON_SECRET) or from a
 * Server Action that has already checked the caller's permission.
 *
 * Idempotency lives in the database: mkc_hosp_report_begin() claims one
 * (department, date, period) row and returns null when that period already
 * succeeded or is being generated, so a double cron tick or a retry can
 * never post two cards for the same period.
 */

export type Admin = ReturnType<typeof createAdminClient>;

export interface Department {
  id: string;
  code: string;
  timezone: string;
  settings: DepartmentSettings;
  created_at: string;
}

export type GenerateOutcome =
  | { status: "generated"; reportId: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reportId: string | null; error: string };

function wrap<T>(result: { data: T | null; error: { message: string } | null }): SourceResult<T> {
  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true, fetchedAt: new Date().toISOString(), data: (result.data ?? ([] as unknown)) as T };
}

function fromSnapshot<T>(section: unknown): SourceResult<T> {
  const s = section as { ok?: boolean; error?: string; fetched_at?: string; data?: T } | undefined;
  if (!s) return { ok: false, error: "Bagian snapshot tidak ada" };
  if (!s.ok) return { ok: false, error: s.error ?? "gagal" };
  return { ok: true, fetchedAt: s.fetched_at ?? new Date().toISOString(), data: s.data as T };
}

export async function loadDepartments(admin: Admin, code?: string): Promise<Department[]> {
  let q = admin.from("mkc_chat_departments").select("id, code, timezone, settings, created_at").eq("is_active", true);
  if (code) q = q.eq("code", code);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((d) => ({
    id: d.id,
    code: d.code,
    timezone: d.timezone || DEFAULT_TIMEZONE,
    settings: (d.settings ?? {}) as DepartmentSettings,
    created_at: d.created_at,
  }));
}

export async function generateHospitalityReport(
  admin: Admin,
  dept: Department,
  periodKind: PeriodKind,
  reportDate: string,
  generatedBy: string | null = null,
): Promise<GenerateOutcome> {
  const { data: reportId, error: beginError } = await admin.rpc("mkc_hosp_report_begin", {
    p_department_id: dept.id,
    p_report_date: reportDate,
    p_period_kind: periodKind,
    p_generated_by: generatedBy,
  });
  if (beginError) return { status: "failed", reportId: null, error: beginError.message };
  if (!reportId) return { status: "skipped", reason: "sudah dibuat atau sedang diproses" };

  const now = new Date();
  try {
    const window = reportWindow(periodKind, reportDate, dept.settings, dept.timezone, now);
    const [snapshot, tasks, issues, checklists, pastReports] = await Promise.all([
      admin.rpc("mkc_hosp_report_villa_snapshot", { p_from: window.from, p_to: window.to, p_local_date: reportDate }),
      admin
        .from("mkc_hosp_room_tasks")
        .select("id, unit_nomor, unit_id, status, assigned_to, created_at, updated_at, target_at, completed_at, completion_source, conflict_note, blocked_reason")
        .eq("department_id", dept.id)
        .or(`status.not.in.(completed,cancelled),completed_at.gte.${window.from}`),
      admin
        .from("mkc_hosp_issues")
        .select("id, code, title, category, severity, status, unit_nomor, assigned_to, reporter_id, created_at, updated_at, target_at, escalated_at, resolved_at")
        .eq("department_id", dept.id)
        .or(`status.in.(open,in_progress),updated_at.gte.${window.from}`),
      admin.from("mkc_hosp_checklists").select("kind, result, submitted_at").eq("department_id", dept.id).eq("report_date", reportDate),
      admin
        .from("mkc_hosp_reports")
        .select("report_date, period_kind, status, error, attempts")
        .eq("department_id", dept.id)
        .neq("period_kind", "manual")
        .gte("report_date", addDays(reportDate, -1))
        .lte("report_date", reportDate),
    ]);

    const personIds = [
      ...new Set(
        [...(tasks.data ?? []).map((t) => t.assigned_to), ...(issues.data ?? []).flatMap((i) => [i.assigned_to, i.reporter_id])].filter(
          (id): id is string => !!id,
        ),
      ),
    ];
    const people = personIds.length
      ? await admin.from("employees").select("id, full_name").in("id", personIds)
      : { data: [] as { id: string; full_name: string }[], error: null };

    const snap = snapshot.error ? null : (snapshot.data as Record<string, unknown>);
    const snapFail = (key: string): SourceResult<never> => ({ ok: false, error: snapshot.error?.message ?? `${key} tidak tersedia` });
    const peopleMap: Record<string, string> = {};
    for (const p of people.data ?? []) peopleMap[p.id] = p.full_name;

    const data = computeHospitalityReport({
      departmentCode: dept.code,
      periodKind,
      reportDate,
      timezone: dept.timezone,
      now,
      window,
      settings: dept.settings,
      departmentCreatedAt: dept.created_at,
      units: snap ? fromSnapshot<UnitRow[]>(snap.units) : snapFail("units"),
      maintenance: snap ? fromSnapshot<MaintenanceRow[]>(snap.maintenance) : snapFail("maintenance"),
      bookings: snap ? fromSnapshot<BookingFacts>(snap.bookings) : snapFail("bookings"),
      jobs: snap ? fromSnapshot<JobHealth>(snap.jobs) : snapFail("jobs"),
      tasks: wrap<TaskRow[]>(tasks),
      issues: wrap<IssueRow[]>(issues),
      checklists: wrap<ChecklistRow[]>(checklists as { data: ChecklistRow[] | null; error: { message: string } | null }),
      pastReports: wrap<PastReportRow[]>(pastReports as { data: PastReportRow[] | null; error: { message: string } | null }),
      people: peopleMap,
    });

    const sources = {
      villa_units: snap ? (snap.units as Json) : { ok: false, error: snapshot.error?.message ?? null },
      villa_maintenance: snap ? (snap.maintenance as Json) : null,
      villa_bookings: snap ? (snap.bookings as Json) : null,
      sync_jobs: snap ? (snap.jobs as Json) : null,
      room_tasks: { ok: !tasks.error, error: tasks.error?.message ?? null },
      issues: { ok: !issues.error, error: issues.error?.message ?? null },
      checklists: { ok: !checklists.error, error: checklists.error?.message ?? null },
    } as unknown as Json;
    // Keep sources small: drop the row payloads, keep ok/error/fetched_at.
    for (const key of ["villa_units", "villa_maintenance", "villa_bookings", "sync_jobs"] as const) {
      const s = (sources as Record<string, Record<string, unknown> | null>)[key];
      if (s && typeof s === "object") delete s.data;
    }

    const { error: finishError } = await admin.rpc("mkc_hosp_report_finish", {
      p_report_id: reportId,
      p_data: data as unknown as Json,
      p_sources: sources,
      p_summary: summarizeReport(data),
    });
    if (finishError) throw new Error(finishError.message);
    return { status: "generated", reportId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("hospitality report generation failed", { reportId, periodKind, reportDate, error: message });
    await admin.rpc("mkc_hosp_report_fail", { p_report_id: reportId, p_error: message });
    return { status: "failed", reportId, error: message };
  }
}

/** Report generator for a department: Hospitality has its own; Markom/Sales Jogja share lib/connect. */
async function generateFor(admin: Admin, dept: Department, periodKind: PeriodKind, reportDate: string, generatedBy: string | null = null) {
  if (dept.code === "hospitality") return generateHospitalityReport(admin, dept, periodKind, reportDate, generatedBy);
  if (isConnectDepartment(dept.code)) return generateConnectReport(admin, dept, periodKind, reportDate, generatedBy);
  return { status: "skipped", reason: `belum ada laporan untuk departemen ${dept.code}` } satisfies GenerateOutcome;
}

/** Keep synced records current before reading them (each also has its own cron). */
async function syncSources(admin: Admin) {
  await admin.rpc("mkc_hosp_sync_room_tasks");
  await admin.rpc("mkc_mkt_sync_kol");
  await admin.rpc("mkc_sales_sync");
}

/** Cron entry point: generate every scheduled period that is due and not yet done, for every active department. */
export async function dispatchDueHospitalityReports(now = new Date()): Promise<{ department: string; periodKind: string; reportDate: string; outcome: GenerateOutcome }[]> {
  const admin = createAdminClient();
  await syncSources(admin);
  const results: { department: string; periodKind: string; reportDate: string; outcome: GenerateOutcome }[] = [];
  for (const dept of await loadDepartments(admin)) {
    for (const due of duePeriods(dept.settings, dept.timezone, now)) {
      const outcome = await generateFor(admin, dept, due.periodKind, due.reportDate);
      results.push({ department: dept.code, periodKind: due.periodKind, reportDate: due.reportDate, outcome });
    }
  }
  return results;
}

/** "Buat laporan sekarang" -- caller's permission must already be checked. */
export async function generateManualHospitalityReport(departmentCode: string, generatedBy: string): Promise<GenerateOutcome> {
  const admin = createAdminClient();
  await syncSources(admin);
  const [dept] = await loadDepartments(admin, departmentCode);
  if (!dept) return { status: "skipped", reason: "departemen tidak ditemukan" };
  return generateFor(admin, dept, "manual", localParts(new Date(), dept.timezone).date, generatedBy);
}
