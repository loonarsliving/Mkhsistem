import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The cross-domain snapshot — the one thing in MK Connect that reads CRM,
 * ads, finance, HR, Markom, occupancy, and automation health in a single pass.
 *
 * Two design rules, both learned from what already exists in this codebase:
 *
 * 1. EVERY SECTION DEGRADES ALONE. repositories/assistant.repository.ts wraps
 *    each count so one renamed table drops one tile to zero instead of
 *    blanking the page. Same here, for a sharper reason: this snapshot feeds
 *    an AI that will happily reason about whatever it is given. A collector
 *    that throws must produce `null` and an explicit note, never a silent
 *    zero — "no leads this week" and "the lead query failed" lead to opposite
 *    executive decisions, and the model cannot tell them apart unless we do.
 *
 * 2. COMPARISONS ARE COMPUTED HERE, NOT BY THE MODEL. Week-over-week deltas
 *    and cost-per-lead are arithmetic; a language model doing arithmetic on
 *    dozens of figures is a source of confident wrong numbers. The model's job
 *    is to explain *why* cost per lead rose 40%, not to work out that it did.
 *
 * The derived cross-domain ratios at the bottom are the actual point of this
 * file. Ad spend alone is a Markom number and lead count alone is a CRM
 * number; spend-per-lead is the number neither domain report contains, and it
 * is the kind of figure FRIDAY exists to act on.
 */

export interface SignalSection<T> {
  data: T | null;
  /** Present when the collector failed; passed to the model verbatim so it can say "data tidak tersedia" instead of assuming zero. */
  error: string | null;
}

export interface CrmSignals {
  newLeads7d: number;
  newLeadsPrev7d: number;
  leadsByStatus: Record<string, number>;
  stalledProspects: number;
  activeProspects: number;
  closings30d: number;
  closingsPrev30d: number;
}

export interface AdSignals {
  activeCampaigns: number;
  totalSpendIdr: number;
  totalClicks: number;
  totalConversations: number;
  campaigns: { name: string; spendIdr: number; clicks: number; conversations: number; costPerConversationIdr: number | null }[];
}

export interface FinanceSignals {
  branches: { branchName: string; saldoIdr: number; syncedAt: string }[];
  pendingExpenseApprovals: number;
}

export interface HrSignals {
  employeesExpectedToday: number;
  checkedInToday: number;
  notCheckedIn: string[];
  pendingLeaveRequests: number;
  pendingRegistrations: number;
}

export interface MarkomSignals {
  openTasks: number;
  overdueTasks: number;
}

export interface OccupancySignals {
  properties: { propertyName: string; totalRooms: number; filledRooms: number; emptyRooms: number }[];
  totalRooms: number;
  filledRooms: number;
  occupancyRate: number;
}

export interface AutomationSignals {
  deadLetter24h: number;
  pendingBacklog: number;
  failedDispatches24h: number;
}

export interface DerivedSignals {
  /** Total active ad spend divided by leads created in the last 7 days. The number no single domain report contains. */
  spendPerLeadIdr: number | null;
  leadTrendPct: number | null;
  closingTrendPct: number | null;
  /** Share of active prospects with no follow-up in 3+ days. High values mean the pipeline is filling faster than it is worked. */
  stalledSharePct: number | null;
  attendanceRatePct: number | null;
  conversationToLeadPct: number | null;
}

export interface FridaySignalSnapshot {
  capturedAt: string;
  periodLabel: string;
  crm: SignalSection<CrmSignals>;
  ads: SignalSection<AdSignals>;
  finance: SignalSection<FinanceSignals>;
  hr: SignalSection<HrSignals>;
  markom: SignalSection<MarkomSignals>;
  occupancy: SignalSection<OccupancySignals>;
  automation: SignalSection<AutomationSignals>;
  derived: DerivedSignals;
}

/** Runs a collector so its failure becomes data ("this section is unavailable") rather than an exception that costs the whole briefing. */
async function collect<T>(name: string, fn: () => Promise<T>): Promise<SignalSection<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("FRIDAY signal collector failed", { collector: name, error: message });
    return { data: null, error: message };
  }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

async function collectCrm(supabase: AdminClient, branchId: string | null): Promise<CrmSignals> {
  const base = () => {
    const q = supabase.from("prospects").select("status, created_at, last_follow_up_at, closed_at").is("deleted_at", null);
    return branchId ? q.eq("branch_id", branchId) : q;
  };

  const { data, error } = await base().gte("created_at", daysAgo(90));
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const now = Date.now();
  const d7 = now - 7 * 24 * 60 * 60 * 1000;
  const d14 = now - 14 * 24 * 60 * 60 * 1000;
  const d30 = now - 30 * 24 * 60 * 60 * 1000;
  const d60 = now - 60 * 24 * 60 * 60 * 1000;
  const stallCutoff = now - 3 * 24 * 60 * 60 * 1000;

  const createdAt = (r: (typeof rows)[number]) => new Date(r.created_at).getTime();
  const leadsByStatus: Record<string, number> = {};
  for (const row of rows) leadsByStatus[row.status] = (leadsByStatus[row.status] ?? 0) + 1;

  const active = rows.filter((r) => r.status !== "closing" && r.status !== "inactive");
  const stalled = active.filter((r) => new Date(r.last_follow_up_at ?? r.created_at).getTime() < stallCutoff);
  const closedAt = (r: (typeof rows)[number]) => (r.closed_at ? new Date(r.closed_at).getTime() : null);

  return {
    newLeads7d: rows.filter((r) => createdAt(r) >= d7).length,
    newLeadsPrev7d: rows.filter((r) => createdAt(r) >= d14 && createdAt(r) < d7).length,
    leadsByStatus,
    stalledProspects: stalled.length,
    activeProspects: active.length,
    closings30d: rows.filter((r) => r.status === "closing" && (closedAt(r) ?? 0) >= d30).length,
    closingsPrev30d: rows.filter((r) => r.status === "closing" && (closedAt(r) ?? 0) >= d60 && (closedAt(r) ?? 0) < d30).length,
  };
}

async function collectAds(supabase: AdminClient): Promise<AdSignals> {
  const { data, error } = await supabase.from("meta_ad_campaigns").select("name, spend_idr, clicks, conversations_started").eq("status", "active");
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const campaigns = rows.map((c) => {
    const spendIdr = Number(c.spend_idr ?? 0);
    const conversations = Number(c.conversations_started ?? 0);
    return {
      name: c.name,
      spendIdr,
      clicks: Number(c.clicks ?? 0),
      conversations,
      costPerConversationIdr: conversations > 0 ? Math.round(spendIdr / conversations) : null,
    };
  });

  return {
    activeCampaigns: campaigns.length,
    totalSpendIdr: campaigns.reduce((sum, c) => sum + c.spendIdr, 0),
    totalClicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
    totalConversations: campaigns.reduce((sum, c) => sum + c.conversations, 0),
    campaigns,
  };
}

async function collectFinance(supabase: AdminClient, branchName: string | null): Promise<FinanceSignals> {
  let balanceQuery = supabase.from("finance_branch_balances").select("branch_name, saldo, synced_at");
  if (branchName) balanceQuery = balanceQuery.ilike("branch_name", `%${branchName}%`);
  const { data, error } = await balanceQuery;
  if (error) throw new Error(error.message);

  const { count } = await supabase
    .from("mkc_notifications")
    .select("id", { count: "exact", head: true })
    .eq("category", "finance_expense_pending_verification")
    .eq("is_read", false);

  return {
    branches: (data ?? []).map((b) => ({ branchName: b.branch_name, saldoIdr: Number(b.saldo), syncedAt: b.synced_at })),
    pendingExpenseApprovals: count ?? 0,
  };
}

async function collectHr(supabase: AdminClient, branchId: string | null): Promise<HrSignals> {
  let attendanceQuery = supabase.from("v_attendance_today").select("full_name, branch_id, check_in_time");
  if (branchId) attendanceQuery = attendanceQuery.eq("branch_id", branchId);
  const { data: attendance, error } = await attendanceQuery;
  if (error) throw new Error(error.message);
  const rows = attendance ?? [];

  const { count: pendingLeave } = await supabase
    .from("leave_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("deleted_at", null);

  // Counted from the source of truth (employees still holding the 'pending'
  // role) rather than from unread notifications: a notification anyone
  // happened to open would otherwise make waiting applicants disappear from
  // the briefing while they are still waiting.
  const { count: pendingRegistrations } = await supabase
    .from("employees")
    .select("id, roles!inner(key)", { count: "exact", head: true })
    .eq("roles.key", "pending")
    .is("deleted_at", null);

  const notCheckedIn = rows.filter((r) => !r.check_in_time).map((r) => r.full_name);
  return {
    employeesExpectedToday: rows.length,
    checkedInToday: rows.length - notCheckedIn.length,
    // Capped: the model needs the shape of the problem, not a roster. The
    // count above is the number that matters.
    notCheckedIn: notCheckedIn.slice(0, 15),
    pendingLeaveRequests: pendingLeave ?? 0,
    pendingRegistrations: pendingRegistrations ?? 0,
  };
}

async function collectMarkom(supabase: AdminClient, branchId: string | null): Promise<MarkomSignals> {
  let query = supabase.from("kpi_tasks").select("status, due_date").is("deleted_at", null).neq("status", "completed");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const today = new Date().toISOString().slice(0, 10);
  const rows = data ?? [];
  return {
    openTasks: rows.length,
    overdueTasks: rows.filter((r) => r.due_date && r.due_date < today).length,
  };
}

async function collectOccupancy(supabase: AdminClient): Promise<OccupancySignals> {
  const { data, error } = await supabase.rpc("get_kos_occupancy_internal");
  if (error) throw new Error(error.message);

  const properties = ((data ?? []) as { property_name: string; total: number; terisi: number; kosong: number }[]).map((row) => ({
    propertyName: row.property_name,
    totalRooms: Number(row.total),
    filledRooms: Number(row.terisi),
    emptyRooms: Number(row.kosong),
  }));

  const totalRooms = properties.reduce((sum, p) => sum + p.totalRooms, 0);
  const filledRooms = properties.reduce((sum, p) => sum + p.filledRooms, 0);
  return {
    properties,
    totalRooms,
    filledRooms,
    occupancyRate: totalRooms > 0 ? Math.round((filledRooms / totalRooms) * 1000) / 10 : 0,
  };
}

/**
 * Automation health belongs in an executive briefing for a reason that is easy
 * to miss: when the AI queue is dead-lettering, every *other* number in this
 * snapshot is quietly stale. A drop in coaching messages sent is not a
 * behavioral finding if the job that sends them has been failing for two days.
 */
async function collectAutomation(supabase: AdminClient): Promise<AutomationSignals> {
  const [{ count: deadLetter }, { count: pending }, { count: failedDispatches }] = await Promise.all([
    supabase.from("ai_job_queue").select("id", { count: "exact", head: true }).eq("status", "dead_letter").gte("created_at", daysAgo(1)),
    supabase.from("ai_job_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("automation_dispatch_log").select("id", { count: "exact", head: true }).gte("dispatched_at", daysAgo(1)).or("timed_out.is.true,status_code.gte.400"),
  ]);

  return {
    deadLetter24h: deadLetter ?? 0,
    pendingBacklog: pending ?? 0,
    failedDispatches24h: failedDispatches ?? 0,
  };
}

function derive(
  crm: SignalSection<CrmSignals>,
  ads: SignalSection<AdSignals>,
  hr: SignalSection<HrSignals>,
): DerivedSignals {
  const c = crm.data;
  const a = ads.data;
  const h = hr.data;

  return {
    spendPerLeadIdr: a && c && c.newLeads7d > 0 ? Math.round(a.totalSpendIdr / c.newLeads7d) : null,
    leadTrendPct: c ? pctChange(c.newLeads7d, c.newLeadsPrev7d) : null,
    closingTrendPct: c ? pctChange(c.closings30d, c.closingsPrev30d) : null,
    stalledSharePct: c && c.activeProspects > 0 ? Math.round((c.stalledProspects / c.activeProspects) * 1000) / 10 : null,
    attendanceRatePct: h && h.employeesExpectedToday > 0 ? Math.round((h.checkedInToday / h.employeesExpectedToday) * 1000) / 10 : null,
    conversationToLeadPct: a && c && a.totalConversations > 0 ? Math.round((c.newLeads7d / a.totalConversations) * 1000) / 10 : null,
  };
}

/**
 * One cross-domain read of the company. All collectors run in parallel — this
 * is invoked from a queued background job, but it still shares one Supabase
 * connection pool with live requests, so it should be one burst rather than a
 * long serial crawl.
 */
export async function captureSignalSnapshot(opts?: { branchId?: string | null; branchName?: string | null }): Promise<FridaySignalSnapshot> {
  const supabase = createAdminClient();
  const branchId = opts?.branchId ?? null;
  const branchName = opts?.branchName ?? null;

  const [crm, ads, finance, hr, markom, occupancy, automation] = await Promise.all([
    collect("crm", () => collectCrm(supabase, branchId)),
    collect("ads", () => collectAds(supabase)),
    collect("finance", () => collectFinance(supabase, branchName)),
    collect("hr", () => collectHr(supabase, branchId)),
    collect("markom", () => collectMarkom(supabase, branchId)),
    collect("occupancy", () => collectOccupancy(supabase)),
    collect("automation", () => collectAutomation(supabase)),
  ]);

  const now = new Date();
  return {
    capturedAt: now.toISOString(),
    periodLabel: now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }),
    crm,
    ads,
    finance,
    hr,
    markom,
    occupancy,
    automation,
    derived: derive(crm, ads, hr),
  };
}

function idr(value: number): string {
  return `Rp${Math.round(value).toLocaleString("id-ID")}`;
}

function sectionOrNote<T>(section: SignalSection<T>, label: string, render: (data: T) => string): string {
  if (section.error) return `[${label}] DATA TIDAK TERSEDIA — query gagal: ${section.error}. Jangan berasumsi angkanya nol.`;
  if (!section.data) return `[${label}] DATA TIDAK TERSEDIA.`;
  return render(section.data);
}

/**
 * Snapshot -> the text block injected into FRIDAY's user prompt.
 *
 * Rendered as labelled prose rather than raw JSON deliberately: units and
 * meaning travel with each figure ("biaya per chat", "Rp"), which is what
 * stops the model reading a rupiah balance as a count. Failed sections are
 * rendered as an explicit unavailability notice for the reason in collect()'s
 * comment above.
 */
export function renderSnapshotForPrompt(snapshot: FridaySignalSnapshot): string {
  const parts: string[] = [`SNAPSHOT DATA PERUSAHAAN — ${snapshot.periodLabel} (WITA)`];

  parts.push(
    sectionOrNote(snapshot.crm, "CRM / Pipeline", (c) => {
      const statusLines = Object.entries(c.leadsByStatus)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ");
      return `[CRM / Pipeline] Lead baru 7 hari terakhir: ${c.newLeads7d} (7 hari sebelumnya: ${c.newLeadsPrev7d}). Prospek aktif: ${c.activeProspects}, di antaranya ${c.stalledProspects} tidak di-follow-up 3 hari atau lebih. Closing 30 hari terakhir: ${c.closings30d} (30 hari sebelumnya: ${c.closingsPrev30d}). Sebaran status (90 hari): ${statusLines || "tidak ada data"}.`;
    }),
  );

  parts.push(
    sectionOrNote(snapshot.ads, "Iklan Meta", (a) => {
      if (a.activeCampaigns === 0) return "[Iklan Meta] Tidak ada campaign aktif saat ini.";
      const lines = a.campaigns.map(
        (c) =>
          `  - ${c.name}: spend ${idr(c.spendIdr)}, klik ${c.clicks}, chat WA ${c.conversations}, biaya per chat ${c.costPerConversationIdr === null ? "belum ada chat" : idr(c.costPerConversationIdr)}`,
      );
      return `[Iklan Meta] ${a.activeCampaigns} campaign aktif. Total spend ${idr(a.totalSpendIdr)}, total klik ${a.totalClicks}, total chat WA ${a.totalConversations}.\n${lines.join("\n")}`;
    }),
  );

  parts.push(
    sectionOrNote(snapshot.finance, "Keuangan", (f) => {
      const lines = f.branches.map((b) => `  - ${b.branchName}: ${idr(b.saldoIdr)}`);
      return `[Keuangan] Saldo kas per cabang:\n${lines.join("\n") || "  (tidak ada data saldo)"}\nPengajuan pengeluaran menunggu verifikasi: ${f.pendingExpenseApprovals}.`;
    }),
  );

  parts.push(
    sectionOrNote(snapshot.hr, "HR / Kehadiran", (h) => {
      const absent = h.notCheckedIn.length > 0 ? ` Belum check-in: ${h.notCheckedIn.join(", ")}.` : "";
      return `[HR / Kehadiran] Hari ini ${h.checkedInToday}/${h.employeesExpectedToday} karyawan sudah check-in.${absent} Pengajuan cuti/izin menunggu persetujuan: ${h.pendingLeaveRequests}. Pendaftaran karyawan menunggu approval: ${h.pendingRegistrations}.`;
    }),
  );

  parts.push(
    sectionOrNote(
      snapshot.markom,
      "Markom",
      (m) => `[Markom] Tugas/checklist belum selesai: ${m.openTasks}, di antaranya ${m.overdueTasks} sudah lewat tenggat.`,
    ),
  );

  parts.push(
    sectionOrNote(snapshot.occupancy, "Okupansi Properti", (o) => {
      if (o.properties.length === 0) return "[Okupansi Properti] Tidak ada data properti.";
      const lines = o.properties.map((p) => `  - ${p.propertyName}: ${p.filledRooms}/${p.totalRooms} terisi (${p.emptyRooms} kosong)`);
      return `[Okupansi Properti] Okupansi keseluruhan ${o.occupancyRate}% (${o.filledRooms}/${o.totalRooms} unit).\n${lines.join("\n")}`;
    }),
  );

  parts.push(
    sectionOrNote(
      snapshot.automation,
      "Kesehatan Automation",
      (a) =>
        `[Kesehatan Automation] Job AI gagal permanen (dead letter) 24 jam terakhir: ${a.deadLetter24h}. Antrian pending saat ini: ${a.pendingBacklog}. Dispatch HTTP gagal 24 jam terakhir: ${a.failedDispatches24h}. CATATAN: kalau angka-angka ini tinggi, sebagian data di atas bisa jadi tidak ter-update — pertimbangkan itu sebelum menyimpulkan adanya perubahan perilaku tim.`,
    ),
  );

  const d = snapshot.derived;
  const derivedLines = [
    `  - Biaya iklan per lead baru (7 hari): ${d.spendPerLeadIdr === null ? "tidak bisa dihitung" : idr(d.spendPerLeadIdr)}`,
    `  - Tren lead minggu ini vs minggu lalu: ${d.leadTrendPct === null ? "tidak bisa dihitung" : `${d.leadTrendPct > 0 ? "+" : ""}${d.leadTrendPct}%`}`,
    `  - Tren closing 30 hari vs 30 hari sebelumnya: ${d.closingTrendPct === null ? "tidak bisa dihitung" : `${d.closingTrendPct > 0 ? "+" : ""}${d.closingTrendPct}%`}`,
    `  - Porsi prospek aktif yang mangkrak (>3 hari tanpa follow-up): ${d.stalledSharePct === null ? "tidak bisa dihitung" : `${d.stalledSharePct}%`}`,
    `  - Tingkat kehadiran hari ini: ${d.attendanceRatePct === null ? "tidak bisa dihitung" : `${d.attendanceRatePct}%`}`,
    `  - Rasio lead baru terhadap chat WA dari iklan: ${d.conversationToLeadPct === null ? "tidak bisa dihitung" : `${d.conversationToLeadPct}%`}`,
  ];
  parts.push(`[ANGKA TURUNAN LINTAS DOMAIN — sudah dihitung sistem, jangan hitung ulang]\n${derivedLines.join("\n")}`);

  return parts.join("\n\n");
}
