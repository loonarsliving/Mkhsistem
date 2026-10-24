import "server-only";

import type { Admin, Department, GenerateOutcome } from "@/lib/hospitality/report-generator";
import { reportWindow, type PeriodKind } from "@/lib/hospitality/report";
import { logger } from "@/lib/logger";
import type { Json } from "@/types/database.types";

import { computeMarkomReport, type ContentRow, type KolRow } from "./markom-report";
import { fromSnapshotSection, summarizeConnectReport, type ConnectReportData } from "./report-types";
import { computeSalesReport, type LeadRow, type PurchaseRow, type VisitRow } from "./sales-report";

/**
 * Report generation for Markom Jogja / Sales Jogja (0294). Same contract as
 * the Hospitality generator: mkc_hosp_report_begin() claims the period
 * idempotently, a SQL snapshot (service role) gathers the sources with a
 * per-source ok/error, the numbers are computed in code, and
 * mkc_hosp_report_finish() posts the card in that department's owner feed.
 */

const CONNECT: Record<string, { title: string; snapshot: "mkc_mkt_report_snapshot" | "mkc_sales_report_snapshot" }> = {
  markom_jogja: { title: "Laporan Markom Jogja", snapshot: "mkc_mkt_report_snapshot" },
  sales_jogja: { title: "Laporan Sales Jogja", snapshot: "mkc_sales_report_snapshot" },
};

export function isConnectDepartment(code: string): boolean {
  return code in CONNECT;
}

function collectIds(snapshot: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown, key?: string) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
    else if (typeof v === "string" && key && /(^|_)(pic_id|sales_id|marketing_employee_id|created_by|id)$/.test(key) && /^[0-9a-f-]{36}$/.test(v)) ids.add(v);
  };
  walk(snapshot);
  // follow-up counts and targets are keyed by employee id
  for (const k of ["follow_ups", "targets"]) {
    const data = (snapshot[k] as { data?: Record<string, unknown> } | undefined)?.data;
    if (data && !Array.isArray(data)) Object.keys(data).forEach((id) => ids.add(id));
  }
  return [...ids];
}

export async function generateConnectReport(
  admin: Admin,
  dept: Department,
  periodKind: PeriodKind,
  reportDate: string,
  generatedBy: string | null = null,
): Promise<GenerateOutcome> {
  const conf = CONNECT[dept.code];
  if (!conf) return { status: "skipped", reason: "bukan departemen Loonars Connect" };

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
    const { data: snap, error: snapError } = await admin.rpc(conf.snapshot, {
      p_department_id: dept.id,
      p_from: window.from,
      p_to: window.to,
      p_local_date: reportDate,
    });
    if (snapError) throw new Error(snapError.message);
    const snapshot = (snap ?? {}) as Record<string, unknown>;

    const ids = collectIds(snapshot);
    const people: Record<string, string> = {};
    if (ids.length) {
      const { data: emps } = await admin.from("employees").select("id, full_name").in("id", ids);
      for (const e of emps ?? []) people[e.id] = e.full_name;
    }
    const settings = (dept.settings ?? {}) as Record<string, unknown>;

    let data: ConnectReportData;
    if (dept.code === "markom_jogja") {
      data = computeMarkomReport({
        departmentCode: dept.code,
        periodKind,
        reportDate,
        timezone: dept.timezone,
        now,
        window,
        settings: { kol_decision_target_hours: Number(settings.kol_decision_target_hours ?? 24) },
        content: fromSnapshotSection<ContentRow[]>(snapshot.content),
        kols: fromSnapshotSection<KolRow[]>(snapshot.kols),
        submissions: fromSnapshotSection<{ published: number; failed: number }>(snapshot.submissions),
        people,
      });
    } else {
      data = computeSalesReport({
        departmentCode: dept.code,
        periodKind,
        reportDate,
        timezone: dept.timezone,
        now,
        window,
        settings: {
          lead_first_contact_hours: Number(settings.lead_first_contact_hours ?? 24),
          lead_stale_days: Number(settings.lead_stale_days ?? 3),
          daily_report_due: String(settings.daily_report_due ?? "19:00"),
        },
        members: fromSnapshotSection<{ id: string; role: string }[]>(snapshot.sales),
        leads: fromSnapshotSection<LeadRow[]>(snapshot.leads),
        followUps: fromSnapshotSection<Record<string, number>>(snapshot.follow_ups),
        visits: fromSnapshotSection<VisitRow[]>(snapshot.visits),
        dailyReports: fromSnapshotSection<{ sales_id: string; follow_ups: number; visits: number; hot: number }[]>(snapshot.daily_reports),
        siteplan: fromSnapshotSection<{ units: Record<string, number>; purchases: PurchaseRow[] }>(snapshot.siteplan),
        targets: fromSnapshotSection<Record<string, number>>(snapshot.targets),
        people,
      });
    }

    // Keep only ok/error/fetched_at per source in the stored report.
    const sources: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(snapshot)) {
      const s = v as { ok?: boolean; error?: string; fetched_at?: string };
      sources[k] = { ok: !!s?.ok, error: s?.error ?? null, fetched_at: s?.fetched_at ?? null };
    }

    const { error: finishError } = await admin.rpc("mkc_hosp_report_finish", {
      p_report_id: reportId,
      p_data: data as unknown as Json,
      p_sources: sources as Json,
      p_summary: summarizeConnectReport(conf.title, data),
    });
    if (finishError) throw new Error(finishError.message);
    return { status: "generated", reportId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("connect report generation failed", { reportId, department: dept.code, periodKind, reportDate, error: message });
    await admin.rpc("mkc_hosp_report_fail", { p_report_id: reportId, p_error: message });
    return { status: "failed", reportId, error: message };
  }
}
