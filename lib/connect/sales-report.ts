/**
 * Sales Jogja report (Loonars Connect, 0294) -- pure consolidation of CRM
 * leads/follow-ups (the CRM stays the source), site visits and daily reports
 * from the group, Loonars 2 bookings (siteplan) and monthly targets.
 */

import type { PeriodKind, SourceResult } from "@/lib/hospitality/report";
import { localParts, parseHHmm } from "@/lib/hospitality/time";

import { unavailableMetric, type ConnectMetric, type ConnectReportData, type ConnectSection } from "./report-types";

/** Daily report checklist keys. MUST match public.mkc_sales_daily_items() (0294). */
export const SALES_DAILY_ITEMS = [
  { key: "lead_baru_dihubungi", label: "Semua lead baru sudah dihubungi" },
  { key: "follow_up_dicatat_crm", label: "Follow-up hari ini sudah dicatat di CRM" },
  { key: "materi_promosi_dibagikan", label: "Materi promosi Loonars 2 dibagikan" },
] as const;

export interface LeadRow {
  id: string;
  sales_id: string | null;
  status: string;
  temperature: string | null;
  created_at: string;
  last_follow_up_at: string | null;
}
export interface VisitRow {
  id: string;
  sales_id: string;
  status: string;
  scheduled_at: string;
}
export interface PurchaseRow {
  id: string;
  status: string;
  marketing_employee_id: string | null;
  verified_at: string | null;
  created_at: string;
  blok: string;
}

export interface SalesReportInputs {
  departmentCode: string;
  periodKind: PeriodKind;
  reportDate: string;
  timezone: string;
  now: Date;
  window: { from: string; to: string };
  settings: { lead_first_contact_hours?: number; lead_stale_days?: number; daily_report_due?: string };
  members: SourceResult<{ id: string; role: string }[]>;
  leads: SourceResult<LeadRow[]>;
  followUps: SourceResult<Record<string, number>>;
  visits: SourceResult<VisitRow[]>;
  dailyReports: SourceResult<{ sales_id: string; follow_ups: number; visits: number; hot: number }[]>;
  siteplan: SourceResult<{ units: Record<string, number>; purchases: PurchaseRow[] }>;
  targets: SourceResult<Record<string, number>>;
  people: Record<string, string>;
}

const SRC = {
  crm: "CRM: prospek & follow-up",
  visits: "Loonars Connect: kunjungan lokasi",
  daily: "Loonars Connect: laporan harian sales",
  siteplan: "Siteplan Loonars 2",
  targets: "Target sales bulanan",
};

const ACTIVE = new Set(["red", "yellow", "green"]);

export function isLeadOverdue(lead: LeadRow, now: Date, firstContactHours: number, staleDays: number): boolean {
  if (!ACTIVE.has(lead.status)) return false;
  if (!lead.last_follow_up_at) return now.getTime() - Date.parse(lead.created_at) > firstContactHours * 3_600_000;
  return now.getTime() - Date.parse(lead.last_follow_up_at) > staleDays * 86_400_000;
}

export function computeSalesReport(input: SalesReportInputs): ConnectReportData {
  const { now, reportDate } = input;
  const name = (id: string | null) => (id ? (input.people[id] ?? "(tidak dikenal)") : "(belum ada sales)");
  const failedSources: { source: string; error: string }[] = [];
  for (const [k, label] of [
    ["members", "Anggota grup"],
    ["leads", SRC.crm],
    ["followUps", SRC.crm],
    ["visits", SRC.visits],
    ["dailyReports", SRC.daily],
    ["siteplan", SRC.siteplan],
    ["targets", SRC.targets],
  ] as const) {
    const r = input[k];
    if (!r.ok) failedSources.push({ source: label, error: r.error });
  }
  const metrics: ConnectMetric[] = [];
  const sections: ConnectSection[] = [];
  const caveats: string[] = [];
  const firstH = input.settings.lead_first_contact_hours ?? 24;
  const staleD = input.settings.lead_stale_days ?? 3;
  const windowFrom = Date.parse(input.window.from);
  const salesIds = input.members.ok ? input.members.data.filter((m) => m.role === "sales").map((m) => m.id) : [];

  // ---- leads ----
  if (input.leads.ok) {
    const leads = input.leads.data;
    const fresh = leads.filter((l) => Date.parse(l.created_at) >= windowFrom);
    const overdue = leads.filter((l) => isLeadOverdue(l, now, firstH, staleD));
    const hot = leads.filter((l) => ACTIVE.has(l.status) && l.temperature === "hot");
    metrics.push({ key: "new_leads", label: "Lead baru", value: fresh.length, source: SRC.crm });
    metrics.push({ key: "overdue_leads", label: "Lead terlambat di-follow-up", value: overdue.length, source: SRC.crm, tone: overdue.length ? "bad" : "good" });
    metrics.push({ key: "hot_leads", label: "Prospek panas", value: hot.length, source: SRC.crm });
    const bySales = new Map<string, number>();
    for (const l of overdue) bySales.set(name(l.sales_id), (bySales.get(name(l.sales_id)) ?? 0) + 1);
    sections.push({
      key: "overdue_by_sales",
      title: "Lead terlambat di-follow-up",
      tone: "bad",
      items: [...bySales.entries()].sort((a, b) => b[1] - a[1]).map(([n, c]) => `${n}: ${c} lead (pertama ≤${firstH} jam, lanjutan ≤${staleD} hari)`),
    });
  } else {
    metrics.push(unavailableMetric("new_leads", "Lead baru", SRC.crm, input.leads));
    metrics.push(unavailableMetric("overdue_leads", "Lead terlambat di-follow-up", SRC.crm, input.leads));
  }

  if (input.followUps.ok) {
    const total = Object.values(input.followUps.data).reduce((a, b) => a + b, 0);
    metrics.push({ key: "follow_ups", label: "Follow-up tercatat", value: total, source: SRC.crm });
  } else {
    metrics.push(unavailableMetric("follow_ups", "Follow-up tercatat", SRC.crm, input.followUps));
  }

  // ---- visits ----
  if (input.visits.ok) {
    const todays = input.visits.data.filter((v) => localParts(new Date(v.scheduled_at), input.timezone).date === reportDate);
    const done = todays.filter((v) => v.status === "done").length;
    const missed = input.visits.data.filter((v) => v.status === "scheduled" && Date.parse(v.scheduled_at) < now.getTime() - 3 * 3_600_000);
    metrics.push({ key: "visits", label: "Kunjungan selesai", value: done, total: todays.length, source: SRC.visits });
    sections.push({
      key: "visits_unreported",
      title: "Kunjungan lewat tanpa hasil",
      tone: "warn",
      items: missed.map((v) => `${name(v.sales_id)} — jadwal ${new Date(v.scheduled_at).toLocaleString("id-ID", { timeZone: input.timezone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`),
    });
  } else {
    metrics.push(unavailableMetric("visits", "Kunjungan selesai", SRC.visits, input.visits));
  }

  // ---- Loonars 2 ----
  const monthPrefix = reportDate.slice(0, 7);
  const verifiedThisMonth = new Map<string, number>();
  if (input.siteplan.ok) {
    const { units, purchases } = input.siteplan.data;
    const pending = purchases.filter((p) => p.status === "pending_verification");
    const verified = purchases.filter((p) => p.status === "verified" && p.verified_at && localParts(new Date(p.verified_at), input.timezone).date.startsWith(monthPrefix));
    for (const p of verified) if (p.marketing_employee_id) verifiedThisMonth.set(p.marketing_employee_id, (verifiedThisMonth.get(p.marketing_employee_id) ?? 0) + 1);
    const total = Object.values(units).reduce((a, b) => a + b, 0);
    metrics.push({ key: "units_available", label: "Unit Loonars 2 tersedia", value: units["tersedia"] ?? 0, total, source: SRC.siteplan });
    metrics.push({ key: "verified_month", label: "Tanda jadi terverifikasi (bulan ini)", value: verified.length, source: SRC.siteplan, tone: verified.length ? "good" : undefined });
    sections.push({
      key: "pending_verification",
      title: "Tanda jadi menunggu verifikasi Finance",
      tone: "warn",
      items: pending.map((p) => `Unit ${p.blok} — ${name(p.marketing_employee_id)}`),
    });
  } else {
    metrics.push(unavailableMetric("units_available", "Unit Loonars 2 tersedia", SRC.siteplan, input.siteplan));
  }

  // ---- per-sales accountability + daily reports ----
  if (input.members.ok) {
    const local = localParts(now, input.timezone);
    const due = parseHHmm(input.settings.daily_report_due) ?? 19 * 60;
    const reportDue = reportDate < local.date || local.minutes >= due;
    const reported = input.dailyReports.ok ? new Set(input.dailyReports.data.map((d) => d.sales_id)) : null;
    const missing = reported && reportDue ? salesIds.filter((id) => !reported.has(id)) : [];
    if (input.dailyReports.ok) {
      metrics.push({
        key: "daily_reports",
        label: "Laporan harian masuk",
        value: input.dailyReports.data.filter((d) => salesIds.includes(d.sales_id)).length,
        total: salesIds.length,
        source: SRC.daily,
        tone: missing.length ? "bad" : "good",
      });
    }
    sections.push({ key: "daily_missing", title: "Belum kirim laporan harian", tone: "bad", items: missing.map((id) => name(id)) });
    sections.push({
      key: "per_sales",
      title: "Per sales",
      tone: "info",
      items: salesIds.map((id) => {
        const fu = input.followUps.ok ? (input.followUps.data[id] ?? 0) : null;
        const target = input.targets.ok ? input.targets.data[id] : undefined;
        const won = verifiedThisMonth.get(id) ?? 0;
        return `${name(id)} — follow-up ${fu ?? "?"}, laporan ${reported ? (reported.has(id) ? "✓" : reportDue ? "✗" : "belum waktunya") : "?"}, tanda jadi bulan ini ${won}${target != null ? `/${target} target` : " (target belum diatur)"}`;
      }),
    });
  }

  caveats.push("Lead & follow-up dihitung dari CRM; aktivitas yang tidak dicatat di CRM tidak terhitung.");

  return {
    version: 1,
    kind: "sales",
    departmentCode: input.departmentCode,
    periodKind: input.periodKind,
    reportDate,
    timezone: input.timezone,
    generatedAt: now.toISOString(),
    window: input.window,
    metrics,
    sections,
    failedSources,
    caveats,
  };
}
