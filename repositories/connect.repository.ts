import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for the Markom Jogja / Sales Jogja groups (0294), under the caller's
 * own session. Content plans, KOLs and daily reports are read directly (RLS:
 * mkc_hosp_can_view_department). CRM prospects, visits and Loonars 2
 * purchases come through mkc_sales_cards / mkc_sales_open_work, which return
 * only the fields a card needs -- never the customer's phone number.
 */

export interface ContentPlanRef {
  id: string;
  plannedDate: string;
  platform: string;
  format: string;
  topic: string;
  title: string;
  brief: string | null;
  picId: string;
  kolId: string | null;
  status: string;
  publishedUrl: string | null;
  publishedAt: string | null;
  cancelReason: string | null;
}

export interface KolRef {
  id: string;
  kolHandle: string;
  platform: string;
  followers: number | null;
  niche: string | null;
  compensation: string;
  requestedCheckin: string;
  nights: number;
  deliverables: string[];
  deliverablesDone: Record<string, { url?: string; at?: string; by?: string }>;
  notes: string | null;
  status: string;
  approvedUnitNomor: string | null;
  approvedCheckin: string | null;
  approvedNights: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  voucherKode: string | null;
  voucherValidUntil: string | null;
  bookedUnitNomor: string | null;
  bookedCheckin: string | null;
  bookedCheckout: string | null;
  contentDueAt: string | null;
  cancelReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ProspectRef {
  id: string;
  name: string;
  city: string | null;
  houseType: string | null;
  leadSource: string | null;
  status: string;
  temperature: string | null;
  salesId: string | null;
  createdAt: string;
  lastFollowUpAt: string | null;
  followUps: number;
  nextVisitAt: string | null;
}

export interface VisitRef {
  id: string;
  prospectId: string;
  prospectName: string;
  salesId: string;
  scheduledAt: string;
  status: string;
  interest: string | null;
  note: string | null;
  resultNote: string | null;
}

export interface PurchaseRef {
  id: string;
  blok: string;
  tipe: string | null;
  status: string;
  transactionType: string | null;
  marketingEmployeeId: string | null;
  transactionDate: string | null;
  verifiedAt: string | null;
  rejectReason: string | null;
  feeStatus: string | null;
}

export interface DailyReportRef {
  id: string;
  salesId: string;
  reportDate: string;
  items: Record<string, boolean>;
  followUps: number;
  visits: number;
  hotProspects: number;
  notes: string | null;
}

/** Villa cost request (0307), as mkc_biaya_cards returns it: no storage paths. */
export interface BiayaRef {
  id: string;
  nomor: number;
  kategori: "laundry" | "netflix" | "lain_lain";
  kategoriNama: string | null;
  jenis: "permintaan_dana" | "reimburse";
  periode: string;
  nominal: number;
  keterangan: string;
  penerimaNama: string | null;
  penerimaBank: string | null;
  penerimaRekening: string | null;
  status: "diajukan" | "disetujui" | "ditolak" | "ditransfer" | "dibatalkan";
  diajukanLewat: "dashboard" | "chat";
  diajukanOlehNama: string;
  diajukanOlehEmployee: string | null;
  diputusOlehNama: string | null;
  catatanFinance: string | null;
  alasanTolak: string | null;
  tanggalTransfer: string | null;
  ditransferOlehNama: string | null;
  alasanBatal: string | null;
  createdAt: string;
  adaNota: boolean;
  adaBuktiBayar: boolean;
  adaBuktiTransfer: boolean;
}

export interface ConnectRefs {
  contentPlans: Record<string, ContentPlanRef>;
  kols: Record<string, KolRef>;
  prospects: Record<string, ProspectRef>;
  visits: Record<string, VisitRef>;
  purchases: Record<string, PurchaseRef>;
  dailyReports: Record<string, DailyReportRef>;
  biaya: Record<string, BiayaRef>;
}

export const EMPTY_CONNECT_REFS: ConnectRefs = { contentPlans: {}, kols: {}, prospects: {}, visits: {}, purchases: {}, dailyReports: {}, biaya: {} };

export const CONNECT_REF_TABLES = ["content_plan", "kol", "prospect", "visit", "purchase", "daily_report", "biaya"] as const;
export type ConnectRefTable = (typeof CONNECT_REF_TABLES)[number];

const CONTENT_COLS = "id, planned_date, platform, format, topic, title, brief, pic_id, kol_id, status, published_url, published_at, cancel_reason";
const KOL_COLS =
  "id, kol_handle, platform, followers, niche, compensation, requested_checkin, nights, deliverables, deliverables_done, notes, status, approved_unit_nomor, approved_checkin, approved_nights, decided_by, decided_at, decision_note, voucher_kode, voucher_valid_until, booked_unit_nomor, booked_checkin, booked_checkout, content_due_at, cancel_reason, created_by, created_at";

type ContentRow = {
  id: string;
  planned_date: string;
  platform: string;
  format: string;
  topic: string;
  title: string;
  brief: string | null;
  pic_id: string;
  kol_id: string | null;
  status: string;
  published_url: string | null;
  published_at: string | null;
  cancel_reason: string | null;
};

function mapContent(c: ContentRow): ContentPlanRef {
  return {
    id: c.id,
    plannedDate: c.planned_date,
    platform: c.platform,
    format: c.format,
    topic: c.topic,
    title: c.title,
    brief: c.brief,
    picId: c.pic_id,
    kolId: c.kol_id,
    status: c.status,
    publishedUrl: c.published_url,
    publishedAt: c.published_at,
    cancelReason: c.cancel_reason,
  };
}

type KolRow = {
  id: string;
  kol_handle: string;
  platform: string;
  followers: number | null;
  niche: string | null;
  compensation: string;
  requested_checkin: string;
  nights: number;
  deliverables: string[];
  deliverables_done: unknown;
  notes: string | null;
  status: string;
  approved_unit_nomor: string | null;
  approved_checkin: string | null;
  approved_nights: number | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  voucher_kode: string | null;
  voucher_valid_until: string | null;
  booked_unit_nomor: string | null;
  booked_checkin: string | null;
  booked_checkout: string | null;
  content_due_at: string | null;
  cancel_reason: string | null;
  created_by: string;
  created_at: string;
};

function mapKol(k: KolRow): KolRef {
  return {
    id: k.id,
    kolHandle: k.kol_handle,
    platform: k.platform,
    followers: k.followers,
    niche: k.niche,
    compensation: k.compensation,
    requestedCheckin: k.requested_checkin,
    nights: k.nights,
    deliverables: k.deliverables ?? [],
    deliverablesDone: (k.deliverables_done as KolRef["deliverablesDone"]) ?? {},
    notes: k.notes,
    status: k.status,
    approvedUnitNomor: k.approved_unit_nomor,
    approvedCheckin: k.approved_checkin,
    approvedNights: k.approved_nights,
    decidedBy: k.decided_by,
    decidedAt: k.decided_at,
    decisionNote: k.decision_note,
    voucherKode: k.voucher_kode,
    voucherValidUntil: k.voucher_valid_until,
    bookedUnitNomor: k.booked_unit_nomor,
    bookedCheckin: k.booked_checkin,
    bookedCheckout: k.booked_checkout,
    contentDueAt: k.content_due_at,
    cancelReason: k.cancel_reason,
    createdBy: k.created_by,
    createdAt: k.created_at,
  };
}

type CardProspect = {
  id: string;
  name: string;
  city: string | null;
  house_type: string | null;
  lead_source: string | null;
  status: string;
  temperature: string | null;
  sales_id: string | null;
  created_at: string;
  last_follow_up_at: string | null;
  follow_ups?: number;
  next_visit_at?: string | null;
};

function mapProspect(p: CardProspect): ProspectRef {
  return {
    id: p.id,
    name: p.name,
    city: p.city,
    houseType: p.house_type,
    leadSource: p.lead_source,
    status: p.status,
    temperature: p.temperature,
    salesId: p.sales_id,
    createdAt: p.created_at,
    lastFollowUpAt: p.last_follow_up_at,
    followUps: Number(p.follow_ups ?? 0),
    nextVisitAt: p.next_visit_at ?? null,
  };
}

type CardVisit = {
  id: string;
  prospect_id: string;
  prospect_name: string;
  sales_id: string;
  scheduled_at: string;
  status: string;
  interest?: string | null;
  note?: string | null;
  result_note?: string | null;
};

function mapVisit(v: CardVisit): VisitRef {
  return {
    id: v.id,
    prospectId: v.prospect_id,
    prospectName: v.prospect_name,
    salesId: v.sales_id,
    scheduledAt: v.scheduled_at,
    status: v.status,
    interest: v.interest ?? null,
    note: v.note ?? null,
    resultNote: v.result_note ?? null,
  };
}

/** Live state of every Markom/Sales record referenced by a page of messages. */
export async function loadConnectRefs(
  supabase: TypedSupabaseClient,
  departmentCode: string,
  ids: Partial<Record<ConnectRefTable, string[]>>,
  conversationId: string,
): Promise<ConnectRefs> {
  const refs: ConnectRefs = { contentPlans: {}, kols: {}, prospects: {}, visits: {}, purchases: {}, dailyReports: {}, biaya: {} };
  const biaya = ids.biaya ?? [];
  const content = ids.content_plan ?? [];
  const kols = ids.kol ?? [];
  const daily = ids.daily_report ?? [];
  const prospects = ids.prospect ?? [];
  const visits = ids.visit ?? [];
  const purchases = ids.purchase ?? [];
  const none = Promise.resolve({ data: [], error: null });

  const [c, k, d, cards, biayaCards] = await Promise.all([
    content.length ? supabase.from("mkc_mkt_content_plans").select(CONTENT_COLS).in("id", content) : none,
    kols.length ? supabase.from("mkc_mkt_kol_collabs").select(KOL_COLS).in("id", kols) : none,
    daily.length
      ? supabase.from("mkc_sales_daily_reports").select("id, sales_id, report_date, items, follow_ups, visits, hot_prospects, notes").in("id", daily)
      : none,
    prospects.length || visits.length || purchases.length
      ? supabase.rpc("mkc_sales_cards", {
          p_department_code: departmentCode,
          p_prospect_ids: prospects,
          p_visit_ids: visits,
          p_purchase_ids: purchases,
        })
      : Promise.resolve({ data: null, error: null }),
    biaya.length ? supabase.rpc("mkc_biaya_cards", { p_conversation_id: conversationId, p_ids: biaya }) : Promise.resolve({ data: null, error: null }),
  ]);
  for (const r of [c, k, d, cards, biayaCards]) if (r.error) throw new Error(r.error.message);
  for (const b of ((biayaCards.data ?? []) as Record<string, unknown>[])) refs.biaya[String(b.id)] = mapBiaya(b);

  for (const row of (c.data ?? []) as ContentRow[]) refs.contentPlans[row.id] = mapContent(row);
  for (const row of (k.data ?? []) as KolRow[]) refs.kols[row.id] = mapKol(row);
  for (const row of (d.data ?? []) as {
    id: string;
    sales_id: string;
    report_date: string;
    items: unknown;
    follow_ups: number;
    visits: number;
    hot_prospects: number;
    notes: string | null;
  }[]) {
    refs.dailyReports[row.id] = {
      id: row.id,
      salesId: row.sales_id,
      reportDate: row.report_date,
      items: (row.items as Record<string, boolean>) ?? {},
      followUps: row.follow_ups,
      visits: row.visits,
      hotProspects: row.hot_prospects,
      notes: row.notes,
    };
  }
  const card = (cards.data ?? {}) as { prospects?: CardProspect[]; visits?: CardVisit[]; purchases?: Record<string, unknown>[] };
  for (const p of card.prospects ?? []) refs.prospects[p.id] = mapProspect(p);
  for (const v of card.visits ?? []) refs.visits[v.id] = mapVisit(v);
  for (const p of card.purchases ?? []) {
    refs.purchases[String(p.id)] = {
      id: String(p.id),
      blok: String(p.blok ?? "?"),
      tipe: (p.tipe as string | null) ?? null,
      status: String(p.status),
      transactionType: (p.transaction_type as string | null) ?? null,
      marketingEmployeeId: (p.marketing_employee_id as string | null) ?? null,
      transactionDate: (p.transaction_date as string | null) ?? null,
      verifiedAt: (p.verified_at as string | null) ?? null,
      rejectReason: (p.reject_reason as string | null) ?? null,
      feeStatus: (p.fee_status as string | null) ?? null,
    };
  }
  return refs;
}

export interface MarkomOpenWork {
  kind: "markom";
  /** today .. +14 days (any status but cancelled), plus earlier plans still open (late) */
  content: ContentPlanRef[];
  kols: KolRef[];
  today: string;
}

export async function listMarkomOpenWork(supabase: TypedSupabaseClient, departmentId: string, today: string): Promise<MarkomOpenWork> {
  const ahead = new Date(`${today}T00:00:00Z`);
  ahead.setUTCDate(ahead.getUTCDate() + 14);
  const until = ahead.toISOString().slice(0, 10);
  const [content, kols] = await Promise.all([
    supabase
      .from("mkc_mkt_content_plans")
      .select(CONTENT_COLS)
      .eq("department_id", departmentId)
      .lte("planned_date", until)
      .or(`status.in.(planned,in_production,ready),planned_date.gte.${today}`)
      .neq("status", "cancelled")
      .order("planned_date", { ascending: true })
      .limit(200),
    supabase
      .from("mkc_mkt_kol_collabs")
      .select(KOL_COLS)
      .eq("department_id", departmentId)
      .not("status", "in", "(completed,cancelled,rejected)")
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (content.error) throw new Error(content.error.message);
  if (kols.error) throw new Error(kols.error.message);
  return { kind: "markom", content: (content.data as ContentRow[]).map(mapContent), kols: (kols.data as KolRow[]).map(mapKol), today };
}

export interface SalesLead extends ProspectRef {
  overdue: boolean;
}

export interface SalesOpenWork {
  kind: "sales";
  leads: SalesLead[];
  visits: VisitRef[];
  units: Record<string, number>;
}

export async function listSalesOpenWork(supabase: TypedSupabaseClient, departmentCode: string): Promise<SalesOpenWork> {
  const { data, error } = await supabase.rpc("mkc_sales_open_work", { p_department_code: departmentCode });
  if (error) throw new Error(error.message);
  const d = (data ?? {}) as { leads?: (CardProspect & { overdue: boolean })[]; visits?: CardVisit[]; units?: Record<string, number> };
  return {
    kind: "sales",
    leads: (d.leads ?? []).map((l) => ({ ...mapProspect(l), overdue: !!l.overdue })),
    visits: (d.visits ?? []).map(mapVisit),
    units: d.units ?? {},
  };
}

function mapBiaya(b: Record<string, unknown>): BiayaRef {
  const text = (v: unknown) => (v == null ? null : String(v));
  return {
    id: String(b.id),
    nomor: Number(b.nomor),
    kategori: b.kategori as BiayaRef["kategori"],
    kategoriNama: text(b.kategori_nama),
    jenis: b.jenis as BiayaRef["jenis"],
    periode: String(b.periode),
    nominal: Number(b.nominal),
    keterangan: String(b.keterangan ?? ""),
    penerimaNama: text(b.penerima_nama),
    penerimaBank: text(b.penerima_bank),
    penerimaRekening: text(b.penerima_rekening),
    status: b.status as BiayaRef["status"],
    diajukanLewat: b.diajukan_lewat === "dashboard" ? "dashboard" : "chat",
    diajukanOlehNama: String(b.diajukan_oleh_nama ?? ""),
    diajukanOlehEmployee: text(b.diajukan_oleh_employee),
    diputusOlehNama: text(b.diputus_oleh_nama),
    catatanFinance: text(b.catatan_finance),
    alasanTolak: text(b.alasan_tolak),
    tanggalTransfer: text(b.tanggal_transfer),
    ditransferOlehNama: text(b.ditransfer_oleh_nama),
    alasanBatal: text(b.alasan_batal),
    createdAt: String(b.created_at),
    adaNota: b.ada_nota === true,
    adaBuktiBayar: b.ada_bukti_bayar === true,
    adaBuktiTransfer: b.ada_bukti_transfer === true,
  };
}
