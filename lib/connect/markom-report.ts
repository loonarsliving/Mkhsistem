/**
 * Markom Jogja report (Loonars Connect, 0294) -- pure consolidation of the
 * content calendar built in the group, the KOL pipeline (Rebecca's room
 * approvals, vouchers, stays, content owed) and the existing auto-publish
 * pipeline. No I/O; lib/connect/connect-report-generator.ts loads the inputs.
 */

import type { PeriodKind, SourceResult } from "@/lib/hospitality/report";
import { addDays, localParts } from "@/lib/hospitality/time";

import { shortDate, unavailableMetric, type ConnectMetric, type ConnectReportData, type ConnectSection } from "./report-types";

export interface ContentRow {
  id: string;
  planned_date: string;
  title: string;
  platform: string;
  format: string;
  topic: string;
  status: string;
  pic_id: string;
  published_at: string | null;
}

export interface KolRow {
  id: string;
  kol_handle: string;
  status: string;
  nights: number;
  requested_checkin: string;
  approved_checkin: string | null;
  approved_unit_nomor: string | null;
  voucher_kode: string | null;
  voucher_valid_until: string | null;
  booked_checkin: string | null;
  content_due_at: string | null;
  deliverables: string[];
  deliverables_done: Record<string, unknown>;
  created_at: string;
  decided_at: string | null;
  completed_at: string | null;
}

export interface MarkomReportInputs {
  departmentCode: string;
  periodKind: PeriodKind;
  reportDate: string;
  timezone: string;
  now: Date;
  window: { from: string; to: string };
  settings: { kol_decision_target_hours?: number };
  content: SourceResult<ContentRow[]>;
  kols: SourceResult<KolRow[]>;
  submissions: SourceResult<{ published: number; failed: number }>;
  people: Record<string, string>;
}

const SRC = {
  content: "Loonars Connect: kalender konten",
  kols: "Loonars Connect: KOL + booking villa",
  submissions: "Markom: publikasi otomatis",
};

const OPEN_CONTENT = new Set(["planned", "in_production", "ready"]);

export function computeMarkomReport(input: MarkomReportInputs): ConnectReportData {
  const { now, reportDate } = input;
  const name = (id: string) => input.people[id] ?? "(tidak dikenal)";
  const failedSources: { source: string; error: string }[] = [];
  for (const [k, label] of [
    ["content", SRC.content],
    ["kols", SRC.kols],
    ["submissions", SRC.submissions],
  ] as const) {
    const r = input[k];
    if (!r.ok) failedSources.push({ source: label, error: r.error });
  }

  const metrics: ConnectMetric[] = [];
  const sections: ConnectSection[] = [];
  const caveats: string[] = [];

  // ---- content calendar ----
  if (input.content.ok) {
    const rows = input.content.data;
    const today = rows.filter((c) => c.planned_date === reportDate && c.status !== "cancelled");
    const publishedToday = rows.filter((c) => c.published_at && localParts(new Date(c.published_at), input.timezone).date === reportDate);
    const overdue = rows.filter((c) => OPEN_CONTENT.has(c.status) && c.planned_date < reportDate);
    const next7 = rows.filter((c) => c.status !== "cancelled" && c.planned_date > reportDate && c.planned_date <= addDays(reportDate, 7));
    metrics.push({
      key: "published_today",
      label: "Tayang hari ini",
      value: publishedToday.length,
      total: today.length,
      source: SRC.content,
      note: "Tayang / direncanakan untuk hari ini",
      tone: today.length > 0 && publishedToday.length < today.length ? "warn" : "good",
    });
    metrics.push({ key: "overdue", label: "Konten terlambat", value: overdue.length, source: SRC.content, tone: overdue.length ? "bad" : "good" });
    metrics.push({ key: "next7", label: "Rencana 7 hari", value: next7.length, source: SRC.content });
    sections.push({
      key: "overdue",
      title: "Konten terlambat",
      tone: "bad",
      items: overdue
        .sort((a, b) => a.planned_date.localeCompare(b.planned_date))
        .map((c) => `${shortDate(c.planned_date)} · ${c.title} (${c.platform} ${c.format}) — PIC ${name(c.pic_id)}, status ${c.status}`),
    });
    const emptyDays: string[] = [];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(reportDate, i);
      if (!rows.some((c) => c.planned_date === d && c.status !== "cancelled")) emptyDays.push(shortDate(d));
    }
    sections.push({ key: "empty_days", title: "Hari tanpa rencana konten (7 hari ke depan)", tone: "warn", items: emptyDays.length ? [emptyDays.join(", ")] : [] });
    sections.push({
      key: "today",
      title: "Rencana hari ini",
      tone: "info",
      items: today.map((c) => `${c.title} (${c.platform} ${c.format}) — ${c.status === "published" ? "✅ tayang" : c.status}, PIC ${name(c.pic_id)}`),
    });
  } else {
    metrics.push(unavailableMetric("published_today", "Tayang hari ini", SRC.content, input.content));
    metrics.push(unavailableMetric("overdue", "Konten terlambat", SRC.content, input.content));
  }

  // ---- KOL ----
  if (input.kols.ok) {
    const rows = input.kols.data;
    const targetH = input.settings.kol_decision_target_hours ?? 24;
    const waiting = rows.filter((k) => k.status === "requested");
    const contentLate = rows.filter((k) => k.status === "content_due" && k.content_due_at && Date.parse(k.content_due_at) < now.getTime());
    const expiredUnused = rows.filter((k) => k.status === "approved" && k.voucher_valid_until && k.voucher_valid_until < reportDate);
    const active = rows.filter((k) => ["approved", "booked", "staying", "content_due"].includes(k.status));
    const monthPrefix = reportDate.slice(0, 7);
    const nightsThisMonth = rows
      .filter((k) => k.decided_at && localParts(new Date(k.decided_at), input.timezone).date.startsWith(monthPrefix))
      .filter((k) => !["rejected", "cancelled", "requested"].includes(k.status))
      .reduce((sum, k) => sum + (k.nights || 0), 0);
    metrics.push({ key: "kol_active", label: "KOL aktif", value: active.length, source: SRC.kols });
    metrics.push({ key: "kol_nights", label: "Malam kamar KOL bulan ini", value: nightsThisMonth, source: SRC.kols, note: "Disetujui Rebecca" });
    metrics.push({ key: "kol_content_late", label: "KOL belum posting", value: contentLate.length, source: SRC.kols, tone: contentLate.length ? "bad" : "good" });
    sections.push({
      key: "kol_waiting",
      title: "KOL menunggu persetujuan kamar (Rebecca)",
      tone: waiting.some((k) => now.getTime() - Date.parse(k.created_at) > targetH * 3_600_000) ? "bad" : "warn",
      items: waiting.map(
        (k) => `${k.kol_handle} — ${k.nights} malam mulai ${shortDate(k.requested_checkin)}, menunggu ${Math.round((now.getTime() - Date.parse(k.created_at)) / 3_600_000)} jam`,
      ),
    });
    sections.push({
      key: "kol_late",
      title: "KOL belum memenuhi kewajiban konten",
      tone: "bad",
      items: contentLate.map((k) => {
        const missing = k.deliverables.filter((d) => !(d in (k.deliverables_done ?? {})));
        return `${k.kol_handle} — tenggat ${shortDate(k.content_due_at!.slice(0, 10))}, belum: ${missing.join(", ")}`;
      }),
    });
    sections.push({
      key: "kol_expired",
      title: "Kupon KOL kedaluwarsa belum dipakai",
      tone: "warn",
      items: expiredUnused.map((k) => `${k.kol_handle} — ${k.voucher_kode} berlaku s/d ${shortDate(k.voucher_valid_until!)}`),
    });
    sections.push({
      key: "kol_active",
      title: "KOL berjalan",
      tone: "info",
      items: active.map(
        (k) =>
          `${k.kol_handle} — ${k.status}${k.approved_unit_nomor ? `, unit ${k.approved_unit_nomor}` : ""}${k.booked_checkin ? `, menginap ${shortDate(k.booked_checkin)}` : k.approved_checkin ? `, disetujui ${shortDate(k.approved_checkin)}` : ""}`,
      ),
    });
  } else {
    metrics.push(unavailableMetric("kol_active", "KOL aktif", SRC.kols, input.kols));
  }

  // ---- existing auto-publish pipeline ----
  if (input.submissions.ok) {
    metrics.push({ key: "auto_published", label: "Terbit otomatis", value: input.submissions.data.published, source: SRC.submissions });
    if (input.submissions.data.failed > 0) {
      sections.push({ key: "auto_failed", title: "Publikasi otomatis gagal", tone: "bad", items: [`${input.submissions.data.failed} konten gagal terbit hari ini — cek menu Markom`] });
    }
  } else {
    metrics.push(unavailableMetric("auto_published", "Terbit otomatis", SRC.submissions, input.submissions));
  }

  caveats.push("Views/reach belum disertakan: angka performa hanya ditampilkan bila terbaca dari platform, tidak diisi tebakan.");

  return {
    version: 1,
    kind: "markom",
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
