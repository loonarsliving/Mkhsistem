import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { computeMarkomReport, type ContentRow, type KolRow, type MarkomReportInputs } from "@/lib/connect/markom-report";
import { summarizeConnectReport } from "@/lib/connect/report-types";
import { computeSalesReport, isLeadOverdue, SALES_DAILY_ITEMS, type SalesReportInputs } from "@/lib/connect/sales-report";

const TZ = "Asia/Jakarta";
// 2026-10-24 20:10 WIB
const now = new Date("2026-10-24T13:10:00Z");
const ok = <T,>(data: T) => ({ ok: true as const, fetchedAt: now.toISOString(), data });
const fail = (error: string) => ({ ok: false as const, error });
const metric = (r: { metrics: { key: string; value: number | null; total?: number | null }[] }, key: string) => r.metrics.find((m) => m.key === key);
const section = (r: { sections: { key: string; items: string[] }[] }, key: string) => r.sections.find((s) => s.key === key)?.items ?? [];

function content(over: Partial<ContentRow>): ContentRow {
  return { id: "c", planned_date: "2026-10-24", title: "Room tour", platform: "instagram", format: "reels", topic: "villa", status: "planned", pic_id: "alya", published_at: null, ...over };
}
function kol(over: Partial<KolRow>): KolRow {
  return {
    id: "k",
    kol_handle: "@kol",
    status: "requested",
    nights: 2,
    requested_checkin: "2026-11-01",
    approved_checkin: null,
    approved_unit_nomor: null,
    voucher_kode: null,
    voucher_valid_until: null,
    booked_checkin: null,
    content_due_at: null,
    deliverables: ["reels", "story"],
    deliverables_done: {},
    created_at: "2026-10-23T01:00:00Z",
    decided_at: null,
    completed_at: null,
    ...over,
  };
}
function markomInputs(over: Partial<MarkomReportInputs> = {}): MarkomReportInputs {
  return {
    departmentCode: "markom_jogja",
    periodKind: "end_of_day",
    reportDate: "2026-10-24",
    timezone: TZ,
    now,
    window: { from: "2026-10-23T17:00:00Z", to: now.toISOString() },
    settings: { kol_decision_target_hours: 24 },
    content: ok([
      content({ id: "1", status: "published", published_at: "2026-10-24T05:00:00Z" }),
      content({ id: "2", title: "Promo weekend" }),
      content({ id: "3", planned_date: "2026-10-22", title: "Testimoni tamu", status: "in_production" }),
      content({ id: "4", planned_date: "2026-10-26", title: "Loonars 2 progress" }),
    ]),
    kols: ok([
      kol({ id: "a" }),
      kol({ id: "b", kol_handle: "@late", status: "content_due", content_due_at: "2026-10-23T00:00:00Z", deliverables_done: { reels: { url: "x" } }, decided_at: "2026-10-05T03:00:00Z", nights: 1 }),
      kol({ id: "c", kol_handle: "@expired", status: "approved", voucher_kode: "KOL-ABC234", voucher_valid_until: "2026-10-20", decided_at: "2026-10-02T03:00:00Z", nights: 2 }),
    ]),
    submissions: ok({ published: 1, failed: 2 }),
    people: { alya: "Alya" },
    ...over,
  };
}

describe("Markom report", () => {
  it("compares today's plan with what was published and flags late content", () => {
    const r = computeMarkomReport(markomInputs());
    expect(metric(r, "published_today")).toMatchObject({ value: 1, total: 2 });
    expect(metric(r, "overdue")?.value).toBe(1);
    expect(section(r, "overdue")[0]).toContain("Testimoni tamu");
    expect(section(r, "overdue")[0]).toContain("PIC Alya");
    expect(metric(r, "next7")?.value).toBe(1);
  });

  it("lists the days of the coming week with no planned content", () => {
    const days = section(computeMarkomReport(markomInputs()), "empty_days")[0];
    expect(days).toContain("25-10");
    expect(days).not.toContain("26-10");
  });

  it("tracks the KOL pipeline: waiting on Rebecca, content owed, expired vouchers, room nights", () => {
    const r = computeMarkomReport(markomInputs());
    expect(section(r, "kol_waiting")).toHaveLength(1);
    expect(section(r, "kol_late")[0]).toBe("@late — tenggat 23-10, belum: story");
    expect(section(r, "kol_expired")[0]).toContain("KOL-ABC234");
    expect(metric(r, "kol_nights")?.value).toBe(3);
    expect(metric(r, "kol_content_late")?.value).toBe(1);
  });

  it("shows an unavailable source as unknown, not zero", () => {
    const r = computeMarkomReport(markomInputs({ content: fail("timeout") }));
    expect(metric(r, "published_today")?.value).toBeNull();
    expect(r.failedSources[0]).toMatchObject({ error: "timeout" });
    expect(summarizeConnectReport("Laporan Markom Jogja", r)).toContain("Tayang hari ini ?");
  });
});

function salesInputs(over: Partial<SalesReportInputs> = {}): SalesReportInputs {
  return {
    departmentCode: "sales_jogja",
    periodKind: "end_of_day",
    reportDate: "2026-10-24",
    timezone: TZ,
    now,
    window: { from: "2026-10-23T17:00:00Z", to: now.toISOString() },
    settings: { lead_first_contact_hours: 24, lead_stale_days: 3, daily_report_due: "19:00" },
    members: ok([
      { id: "ayu", role: "sales" },
      { id: "fety", role: "sales" },
      { id: "vando", role: "manager" },
    ]),
    leads: ok([
      { id: "l1", sales_id: "ayu", status: "red", temperature: "cold", created_at: "2026-10-24T02:00:00Z", last_follow_up_at: null },
      { id: "l2", sales_id: "fety", status: "red", temperature: "cold", created_at: "2026-10-22T02:00:00Z", last_follow_up_at: null },
      { id: "l3", sales_id: "fety", status: "yellow", temperature: "hot", created_at: "2026-10-01T02:00:00Z", last_follow_up_at: "2026-10-18T02:00:00Z" },
      { id: "l4", sales_id: "ayu", status: "inactive", temperature: "cold", created_at: "2026-09-01T02:00:00Z", last_follow_up_at: null },
    ]),
    followUps: ok({ ayu: 3 }),
    visits: ok([{ id: "v1", sales_id: "ayu", status: "done", scheduled_at: "2026-10-24T03:00:00Z" }]),
    dailyReports: ok([{ sales_id: "ayu", follow_ups: 3, visits: 1, hot: 1 }]),
    siteplan: ok({
      units: { tersedia: 16, terjual: 1 },
      purchases: [
        { id: "p1", status: "verified", marketing_employee_id: "ayu", verified_at: "2026-10-10T03:00:00Z", created_at: "2026-10-09T03:00:00Z", blok: "AVARA-03" },
        { id: "p2", status: "pending_verification", marketing_employee_id: "fety", verified_at: null, created_at: "2026-10-24T03:00:00Z", blok: "BANYU-02" },
      ],
    }),
    targets: ok({ ayu: 2 }),
    people: { ayu: "Ayu", fety: "Fety", vando: "Vando" },
    ...over,
  };
}

describe("Sales report", () => {
  it("counts new leads, CRM follow-ups and overdue leads per sales", () => {
    const r = computeSalesReport(salesInputs());
    expect(metric(r, "new_leads")?.value).toBe(1);
    expect(metric(r, "follow_ups")?.value).toBe(3);
    expect(metric(r, "overdue_leads")?.value).toBe(2); // l2 (never contacted, >24h) + l3 (stale >3d); l1 is fresh, l4 inactive
    expect(section(r, "overdue_by_sales")).toEqual(["Fety: 2 lead (pertama ≤24 jam, lanjutan ≤3 hari)"]);
    expect(metric(r, "hot_leads")?.value).toBe(1);
  });

  it("lists sales without a daily report once it is due, but not before", () => {
    expect(section(computeSalesReport(salesInputs()), "daily_missing")).toEqual(["Fety"]);
    const early = computeSalesReport(salesInputs({ now: new Date("2026-10-24T09:00:00Z") })); // 16:00 WIB
    expect(section(early, "daily_missing")).toEqual([]);
  });

  it("uses siteplan for Loonars 2 availability and verified bookings against monthly targets", () => {
    const r = computeSalesReport(salesInputs());
    expect(metric(r, "units_available")).toMatchObject({ value: 16, total: 17 });
    expect(metric(r, "verified_month")?.value).toBe(1);
    expect(section(r, "pending_verification")).toEqual(["Unit BANYU-02 — Fety"]);
    const perSales = section(r, "per_sales");
    expect(perSales[0]).toContain("Ayu — follow-up 3, laporan ✓, tanda jadi bulan ini 1/2 target");
    expect(perSales[1]).toContain("Fety — follow-up 0, laporan ✗");
    expect(perSales[1]).toContain("target belum diatur");
  });

  it("never turns a failed CRM read into zero", () => {
    const r = computeSalesReport(salesInputs({ leads: fail("permission denied"), followUps: fail("permission denied") }));
    expect(metric(r, "new_leads")?.value).toBeNull();
    expect(metric(r, "follow_ups")?.value).toBeNull();
    expect(section(r, "per_sales")[0]).toContain("follow-up ?");
  });

  it("overdue rule: first contact within N hours, then every M days; closed leads never overdue", () => {
    const base = { id: "x", sales_id: "a", temperature: null };
    expect(isLeadOverdue({ ...base, status: "red", created_at: "2026-10-24T00:00:00Z", last_follow_up_at: null }, now, 24, 3)).toBe(false);
    expect(isLeadOverdue({ ...base, status: "red", created_at: "2026-10-23T00:00:00Z", last_follow_up_at: null }, now, 24, 3)).toBe(true);
    expect(isLeadOverdue({ ...base, status: "closing", created_at: "2026-09-01T00:00:00Z", last_follow_up_at: null }, now, 24, 3)).toBe(false);
  });
});

describe("sales daily checklist keys match migration 0294", () => {
  it("is identical to mkc_sales_daily_items()", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0294_loonars_connect_markom_sales_jogja.sql"), "utf8");
    const fn = sql.slice(sql.indexOf("function public.mkc_sales_daily_items"));
    const keys = [.../array\[([^\]]+)\]/.exec(fn)![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(SALES_DAILY_ITEMS.map((i) => i.key)).toEqual(keys);
  });
});
