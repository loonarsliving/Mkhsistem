import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getOccupancyProvider, getVillaRoomPricesForDate } from "@/lib/occupancy/villa-provider";
import {
  currentRefundMonth,
  listRefundCustomers,
  type RefundCustomer,
} from "@/repositories/refund.repository";
import type { RoomTypeAvailability } from "@/lib/occupancy/types";

import { askAI, generateAIText } from "../service";
import { QUERY_TOOL_CATALOG, runTool, type QueryToolName } from "./data-queries";
import { bacaLoonars2 } from "./loonars2-wa";
import { angkaTakBerdasar } from "./owner-angka";
import { PENGETAHUAN_SISTEM } from "./owner-knowledge";

/**
 * Asisten WhatsApp owner (owner 2026-10-18: "jadikan WhatsApp saya dashboard
 * utama ... cukup saya saja yang punya akses"). Chatbot tanya-jawab lintas
 * keempat sistem untuk SUPER ADMIN saja:
 *
 *   - MK Connect      -> tool data-queries.ts yang sudah ada (lead, iklan,
 *                        saldo cabang, pengajuan, absensi, cuti, Markom)
 *   - Villa           -> okupansi hari ini & ke depan dari villa-api
 *                        (lib/occupancy/villa-provider.ts, GET saja) dan
 *                        keuangan bulan mana pun (GET /bridge/owner-finance:
 *                        rumus halaman Finance villa + laporan investor)
 *   - Loonars         -> pipeline properti loonars.id/hitung (pi_properties,
 *                        pi_surveys -- satu database dengan MK Connect)
 *   - MKH Property    -> ringkasan keuangan + metrik operasi per unit bisnis
 *                        (POST finance.haluoleo.id/api/laporan-investor/
 *                        ringkasan-wa -- data & rumus sama dengan PDF lapkeu)
 *                        dan teks Loonars 2 (saldo/tagihan/utang)
 *
 * TAHAP 1 = HANYA BACA. Tidak ada tool yang mengubah data; perintah yang
 * mengubah data tetap lewat jalur perintah persis di webhook-handler.ts
 * (LUNAS, setujui L2-…, SETUJU AP-…) yang semuanya diperiksa lebih dulu,
 * jadi asisten ini tidak pernah membayangi perintah itu.
 *
 * Aturan angka sama dengan FRIDAY: semua angka berasal dari kode/database,
 * model hanya memilih tool dan merangkai jawaban. Sumber yang gagal
 * dilaporkan "data tidak tersedia", tidak pernah ditebak.
 *
 * Dipanggil dari router.ts hanya bila pengirim adalah super admin aktif.
 */

const VILLA_API_BASE = "https://svcmybsziaelwwdrnzcv.supabase.co/functions/v1/villa-api";
const MKH_PROPERTY_RINGKASAN_URL = "https://finance.haluoleo.id/api/laporan-investor/ringkasan-wa";
const MKH_PROPERTY_CFO_URL = "https://finance.haluoleo.id/api/cfo/tanya-wa";
const MAKS_HARI_OKUPANSI = 14;
const RIWAYAT_MAKS_GILIRAN = 6;
const RIWAYAT_JENDELA_MS = 3 * 60 * 60 * 1000;

type OwnerToolName =
  | "villa_okupansi_hari_ini"
  | "villa_okupansi_ke_depan"
  | "villa_keuangan"
  | "villa_harga"
  | "loonars_properti"
  | "refund_customer"
  | "keuangan_ringkasan"
  | "loonars2_saldo"
  | "loonars2_tagihan"
  | "loonars2_utang"
  | "loonars2_borongan"
  | "ai_cfo";
type ToolName = QueryToolName | OwnerToolName;

const OWNER_TOOL_CATALOG: { name: OwnerToolName; description: string }[] = [
  {
    name: "villa_okupansi_hari_ini",
    description:
      "Villa Loonars Private Living hari ini: unit terisi/kosong/kotor, check-in & check-out hari ini, persen okupansi",
  },
  {
    name: "villa_okupansi_ke_depan",
    description: `Villa: okupansi per tanggal ke depan per tipe kamar (maks ${MAKS_HARI_OKUPANSI} hari), dari ketersediaan yang dijual di website`,
  },
  {
    name: "villa_keuangan",
    description:
      "Villa satu bulan (bisa bulan berjalan): pendapatan kotor/bersih, jumlah booking, sudah dibayar, outstanding, piutang OTA, per channel (Agoda, Booking.com, website, walk-in, ...), booking mendatang, bagi hasil investor & per investor, pendapatan kafe/spa -- sama dengan halaman Finance villa",
  },
  {
    name: "villa_harga",
    description: `Villa: harga jual kamar per malam per tipe kamar pada tanggal tertentu (maks ${MAKS_HARI_OKUPANSI} tanggal berurutan) -- harga website loonars.id dan harga mesin/dasar yang dikirim ke Cloudbeds. BUKAN harga final Agoda/Booking.com`,
  },
  {
    name: "refund_customer",
    description:
      "Refund customer (modul /refund MK Connect): termin refund yang jatuh tempo bulan ini (sudah/belum dibayar, per customer), total refund, sudah terbayar, sisa, customer tanpa jadwal termin, chat customer belum dibaca",
  },
  {
    name: "loonars_properti",
    description:
      "Pipeline properti Loonars Property Intelligence (loonars.id/hitung): properti prospek/survei/negosiasi/aktif, pemilik, kota, hasil survei terakhir",
  },
  {
    name: "keuangan_ringkasan",
    description:
      "Keuangan MKH Property per bulan: pendapatan, beban, laba bersih, kas, aset, liabilitas, utang bank; plus per unit bisnis (villa, proyek) okupansi bulanan, malam terjual, pendapatan kamar kotor/bersih, ADR, RevPAR",
  },
  {
    name: "loonars2_saldo",
    description: "Loonars 2: saldo 4 rekening (A-D) dan status pendanaan unit",
  },
  {
    name: "loonars2_tagihan",
    description: "Loonars 2: tagihan/pembayaran pembeli unit yang belum lunas",
  },
  {
    name: "loonars2_utang",
    description:
      "Loonars 2: daftar rinci sisa utang per toko bangunan proyek villa saja (TANPA Loonars Coffee). Untuk total pengeluaran/biaya/utang Loonars 2 pilih ai_cfo",
  },
  {
    name: "loonars2_borongan",
    description:
      "Loonars 2: rincian borongan tukang/mandor (mis. Sarno) — nilai borongan per unit, upah mingguan yang sudah diajukan & dibayar (total dan jumlah minggu), retensi. BUKAN total pengeluaran Loonars 2 (pilih ai_cfo)",
  },
  {
    name: "ai_cfo",
    description:
      "AI CFO MKH Property (Loonars 1 + Loonars 2 terpusat): posisi kas, forecast arus kas 13 minggu & prediksi defisit (optimis/normal/pesimis), kebutuhan dana, kewajiban & urutan bayar yang disarankan, peringatan risiko, rekonsiliasi, EBITDA villa & bagian MKH setelah jaminan investor, budget vs aktual konstruksi, LAPORAN HOLDING SAK EMKM (laba rugi & neraca gabungan L1+L2+holding, gaji karyawan/beban holding & utang gaji), TOTAL PENGELUARAN / biaya / belanja pembangunan Loonars 2 yang sudah DIGABUNG dengan Loonars Coffee (dan total sisa utang toko gabungan), DAN menilai rencana pengeluaran/keputusan owner (\"mau beli/bangun/keluarkan Rp X, boleh?\") -- pilih ini untuk pertanyaan analisis keuangan, risiko, atau keputusan",
  },
];

const SEMUA_TOOL: { name: ToolName; description: string }[] = [
  ...QUERY_TOOL_CATALOG,
  ...OWNER_TOOL_CATALOG,
];

export interface OwnerIntent {
  isDataQuestion: boolean;
  /** Pertanyaan tentang cara kerja bisnis/sistem (dijawab dari PENGETAHUAN_SISTEM, tanpa angka). */
  isSystemQuestion?: boolean;
  tools: ToolName[];
  branchName: string | null;
  bulanDari: string | null;
  bulanSampai: string | null;
  tanggalMulai: string | null;
  jumlahHari: number | null;
}

const POLA_BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const POLA_TANGGAL = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Exported for tests. Anything malformed becomes "not a data question" / null, never a guess. */
export function parseOwnerIntentJson(text: string): OwnerIntent {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  const p = JSON.parse(cleaned) as Record<string, unknown>;
  const bulan = (v: unknown) => (typeof v === "string" && POLA_BULAN.test(v) ? v : null);
  const hari = Number(p.jumlahHari);
  return {
    isDataQuestion: p.isDataQuestion === true,
    isSystemQuestion: p.isSystemQuestion === true,
    tools: Array.isArray(p.tools)
      ? p.tools.filter((t): t is ToolName => SEMUA_TOOL.some((c) => c.name === t))
      : [],
    branchName:
      typeof p.branchName === "string" && p.branchName.trim() ? p.branchName.trim() : null,
    bulanDari: bulan(p.bulanDari),
    bulanSampai: bulan(p.bulanSampai),
    tanggalMulai:
      typeof p.tanggalMulai === "string" && POLA_TANGGAL.test(p.tanggalMulai)
        ? p.tanggalMulai
        : null,
    jumlahHari: Number.isInteger(hari) && hari > 0 ? Math.min(hari, MAKS_HARI_OKUPANSI) : null,
  };
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Super admin aktif -- sama dengan isVillaOwner di villa-payment-confirmation.ts (pemeriksaan untuk LUNAS). */
export async function isSuperAdminSender(sender: string): Promise<boolean> {
  const suffix = digitsOnly(sender).slice(-9);
  if (suffix.length < 9) return false;
  const supabase = createAdminClient();
  const { data: role } = await supabase
    .from("roles")
    .select("id")
    .eq("key", "super_admin")
    .maybeSingle();
  if (!role?.id) return false;
  const { data: admins } = await supabase
    .from("employees")
    .select("phone")
    .eq("role_id", role.id)
    .eq("is_active", true)
    .not("phone", "is", null);
  return (admins ?? []).some((e) => digitsOnly(e.phone ?? "").endsWith(suffix));
}

/** Tanggal kalender WIB (villa di Jogja), YYYY-MM-DD. */
export function tanggalWib(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function tambahHari(tanggal: string, hari: number): string {
  const d = new Date(`${tanggal}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

export function tambahBulan(bulan: string, n: number): string {
  const [t, b] = bulan.split("-").map(Number);
  const i = t * 12 + (b - 1) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}

function rupiah(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n)
    ? `Rp${Math.round(n).toLocaleString("id-ID")}`
    : "belum tersedia";
}

function angkaAtau(n: number | null | undefined, satuan = ""): string {
  return typeof n === "number" && Number.isFinite(n)
    ? `${n.toLocaleString("id-ID")}${satuan}`
    : "belum tersedia";
}

// ── Okupansi villa ──────────────────────────────────────────────────────

async function runVillaHariIni(): Promise<string> {
  const r = await getOccupancyProvider().getTodaySnapshot();
  if (!r.ok) return `[Villa Hari Ini] data tidak tersedia (${r.reason})`;
  const d = r.data;
  return `[Villa Hari Ini, ${d.tanggal}] ${d.terisi}/${d.total} unit terisi (okupansi ${d.okupansiPersenRaw}%), kosong siap ${d.kosong}, kotor ${d.kotor}. Check-in hari ini ${d.checkinHariIni}, check-out hari ini ${d.checkoutHariIni}.`;
}

export interface HariOkupansi {
  date: string;
  roomTypeName: string;
  totalUnits: number;
  occupiedUnits: number;
}

/** Exported for tests. Totals per date are plain sums of villa-api's own per-room-type counts. */
export function formatOkupansiKeDepan(days: HariOkupansi[]): string {
  const perTanggal = new Map<string, HariOkupansi[]>();
  for (const d of days) perTanggal.set(d.date, [...(perTanggal.get(d.date) ?? []), d]);
  const baris = [...perTanggal.entries()].map(([tanggal, tipe]) => {
    const total = tipe.reduce((s, t) => s + t.totalUnits, 0);
    const terisi = tipe.reduce((s, t) => s + t.occupiedUnits, 0);
    const persen = total > 0 ? Math.round((terisi / total) * 100) : 0;
    const rinci = tipe
      .map((t) => `${t.roomTypeName} ${t.occupiedUnits}/${t.totalUnits}`)
      .join(", ");
    return `${tanggal}: ${terisi}/${total} terisi (${persen}%) -- ${rinci}`;
  });
  return `[Villa Okupansi ke Depan] (dari ketersediaan yang dijual di website/villa-api; unit yang ditutup ikut terhitung terisi)\n${baris.join("\n")}`;
}

async function runVillaKeDepan(mulai: string, jumlahHari: number): Promise<string> {
  const r = await getOccupancyProvider().getForwardAvailability(
    mulai,
    tambahHari(mulai, jumlahHari),
  );
  if (!r.ok) return `[Villa Okupansi ke Depan] data tidak tersedia (${r.reason})`;
  return formatOkupansiKeDepan(r.data);
}

// ── Harga kamar villa ───────────────────────────────────────────────────

/**
 * Exported for tests. Harga OTA final sengaja tidak dihitung: tambahan per
 * channel diatur owner di Cloudbeds Distribution dan tidak terbaca lewat API
 * (villa CURRENT_STATE 2026-10-08), sedangkan integration_settings
 * 'harga_website_agoda'.tambahan adalah tuas harga website (Standard sengaja
 * 0 sejak 13 Okt), bukan salinan tambahan OTA yang sebenarnya.
 */
export function formatHargaVilla(
  perTanggal: { date: string; rooms: RoomTypeAvailability[] }[],
): string {
  const baris = perTanggal.map(({ date, rooms }) => {
    const rinci = rooms.map((r) =>
      r.available === 0 || r.pricePerNightAvg === null
        ? `${r.name}: penuh (0/${r.total} kosong, harga tidak dihitung)`
        : `${r.name}: website ${rupiah(r.pricePerNightAvg)}, harga mesin/dasar Cloudbeds ${rupiah(r.priceNormalPerNightAvg)} (${r.available}/${r.total} kosong)`,
    );
    return `${date}: ${rinci.join("; ")}`;
  });
  return `[Harga Kamar Villa per Malam] (dihitung villa-api, rumus sama dengan form booking loonars.id. Harga Agoda/Booking.com = harga dasar + tambahan per channel yang diatur di Cloudbeds, dikurangi diskon OTA sendiri -- tidak tersedia di sistem, jangan ditebak)\n${baris.join("\n")}`;
}

async function runVillaHarga(mulai: string, jumlahHari: number): Promise<string> {
  const hasil: { date: string; rooms: RoomTypeAvailability[] }[] = [];
  for (let i = 0; i < jumlahHari; i++) {
    const date = tambahHari(mulai, i);
    const r = await getVillaRoomPricesForDate(date);
    if (!r.ok) return `[Harga Kamar Villa] data tidak tersedia (${r.reason})`;
    hasil.push({ date, rooms: r.data });
  }
  return formatHargaVilla(hasil);
}

// ── Keuangan villa ──────────────────────────────────────────────────────

/** Bentuk respons villa-api GET /bridge/owner-finance (bagian yang dipakai di sini). */
export interface KeuanganVilla {
  bulan: string;
  hari_ini: string;
  finance: {
    gross_revenue: number;
    net_revenue: number;
    payment_received: number;
    outstanding: number;
    ota_receivable: number;
    bookings_counted: number;
    cancelled_excluded: number;
    pipeline: { amount: number; count: number };
    cash_received: { amount: number; verified: boolean; count: number };
    alerts: { message: string }[];
  };
  channel: {
    channels: {
      sumber: string;
      booking_count: number;
      room_nights: number;
      revenue: number;
      net_revenue: number;
      avg_net_adr: number | null;
    }[];
    bersih_belum_tersedia: number;
  };
  laporan_investor: {
    gross_revenue: number;
    opex_per_unit: number;
    marketing_amount: number;
    net: number;
    owner_amount: number;
    pengelola_amount: number;
    investor_count: number;
    per_investor_amount: number;
    jaminan_aktif: boolean;
    jaminan_topup: number;
    walkin_income: { cafe: number; spa: number; lainnya: number; total: number };
  };
}

/** Exported for tests. Copies villa-api's numbers as-is. */
export function formatKeuanganVilla(k: KeuanganVilla): string {
  const f = k.finance;
  const inv = k.laporan_investor;
  const out = [
    `[Keuangan Villa ${k.bulan}] (sumber: halaman Finance villa; pemasukan diakui per tanggal check-in Cloudbeds, per ${k.hari_ini})`,
    `Pendapatan kamar kotor ${rupiah(f.gross_revenue)}, bersih (sebelum fee OTA) ${rupiah(f.net_revenue)} dari ${f.bookings_counted} booking (${f.cancelled_excluded} batal tidak dihitung).`,
    `Sudah dibayar ${rupiah(f.payment_received)}, outstanding ${rupiah(f.outstanding)}, piutang OTA belum cair ${rupiah(f.ota_receivable)}, uang diterima tercatat Finance ${f.cash_received.verified ? rupiah(f.cash_received.amount) : "belum diverifikasi"}.`,
    `Booking mendatang bulan ini (belum dihitung): ${f.pipeline.count} booking, bersih ${rupiah(f.pipeline.amount)}.`,
  ];
  if (k.channel.channels.length) {
    out.push(
      `Per channel: ${k.channel.channels
        .map(
          (c) =>
            `${c.sumber} ${c.booking_count} booking/${c.room_nights} malam, kotor ${rupiah(c.revenue)}, bersih ${rupiah(c.net_revenue)}, ADR bersih ${rupiah(c.avg_net_adr)}`,
        )
        .join("; ")}.`,
    );
  }
  if (k.channel.bersih_belum_tersedia > 0)
    out.push(
      `${k.channel.bersih_belum_tersedia} booking OTA belum punya angka bersih dari Cloudbeds.`,
    );
  out.push(
    `Laporan investor (rumus bagi hasil villa, dari transaksi pemasukan bulan ini): pendapatan ${rupiah(inv.gross_revenue)}, opex ${rupiah(inv.opex_per_unit)}, marketing ${rupiah(inv.marketing_amount)}, bersih ${rupiah(inv.net)}, bagian investor ${rupiah(inv.owner_amount)} untuk ${inv.investor_count} investor (${rupiah(inv.per_investor_amount)} per investor${inv.jaminan_aktif ? `, jaminan aktif: top-up ${rupiah(inv.jaminan_topup)} per investor` : ""}), bagian pengelola ${rupiah(inv.pengelola_amount)}.`,
    `Non-kamar (tidak masuk bagi hasil): kafe ${rupiah(inv.walkin_income.cafe)}, spa ${rupiah(inv.walkin_income.spa)}, lainnya ${rupiah(inv.walkin_income.lainnya)}.`,
  );
  if (f.alerts.length)
    out.push(`Peringatan Finance: ${f.alerts.map((a) => a.message).join(" | ")}`);
  return out.join("\n");
}

async function runVillaKeuangan(bulan: string): Promise<string> {
  const secret = (process.env.VILLA_BRIDGE_SECRET ?? "").trim();
  if (!secret)
    return "[Keuangan Villa] data tidak tersedia (VILLA_BRIDGE_SECRET belum dikonfigurasi)";
  try {
    const res = await fetch(`${VILLA_API_BASE}/bridge/owner-finance?bulan=${bulan}`, {
      headers: { "x-internal-secret": secret },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.error("owner-assistant: villa-api menolak owner-finance", { status: res.status });
      return `[Keuangan Villa ${bulan}] data tidak tersedia (villa-api HTTP ${res.status})`;
    }
    return formatKeuanganVilla((await res.json()) as KeuanganVilla);
  } catch (e) {
    logger.error("owner-assistant: villa-api tidak bisa dihubungi", {
      error: e instanceof Error ? e.message : String(e),
    });
    return `[Keuangan Villa ${bulan}] data tidak tersedia (villa-api tidak bisa dihubungi)`;
  }
}

// ── Refund customer ─────────────────────────────────────────────────────

/** Exported for tests. Paid/remaining come from listRefundCustomers -- the same numbers /refund shows. */
export function formatRefund(customers: RefundCustomer[], bulan: string): string {
  if (!customers.length) return "[Refund Customer] Belum ada customer refund.";
  const label = bulan.slice(0, 7);
  const jatuhTempo = customers.flatMap((c) =>
    c.installments.filter((i) => i.dueMonth === bulan).map((i) => ({ nama: c.name, ...i })),
  );
  const sudah = jatuhTempo.filter((i) => i.isPaid);
  const belum = jatuhTempo.filter((i) => !i.isPaid);
  const jumlah = (xs: { amount: number }[]) => xs.reduce((s, x) => s + x.amount, 0);
  const total = (f: (c: RefundCustomer) => number) => customers.reduce((s, c) => s + f(c), 0);
  const out = [
    `[Refund Customer] (sumber: modul /refund MK Connect)`,
    `Termin jatuh tempo ${label}: ${jatuhTempo.length} termin, total ${rupiah(jumlah(jatuhTempo))}; sudah dibayar ${sudah.length} termin ${rupiah(jumlah(sudah))}; belum dibayar ${belum.length} termin ${rupiah(jumlah(belum))}.`,
  ];
  if (jatuhTempo.length) {
    out.push(
      `Rincian ${label}: ${jatuhTempo.map((i) => `${i.nama} ${rupiah(i.amount)} ${i.isPaid ? "✅ dibayar" : "⏳ belum"}`).join("; ")}.`,
    );
  }
  out.push(
    `Keseluruhan ${customers.length} customer: total refund ${rupiah(total((c) => c.refundAmount))}, sudah terbayar ${rupiah(total((c) => c.paidAmount))}, sisa ${rupiah(total((c) => c.remainingAmount))}.`,
  );
  const tanpaJadwal = customers.filter((c) => c.unscheduledAmount > 0.5);
  if (tanpaJadwal.length) {
    out.push(
      `Sisa yang belum punya jadwal termin: ${tanpaJadwal.map((c) => `${c.name} ${rupiah(c.unscheduledAmount)}`).join("; ")}.`,
    );
  }
  const lebih = customers.filter((c) => c.overScheduled);
  if (lebih.length)
    out.push(
      `Jadwal termin melebihi sisa (perlu dikoreksi): ${lebih.map((c) => c.name).join(", ")}.`,
    );
  const chat = customers.filter((c) => c.unreadMessages > 0);
  if (chat.length)
    out.push(
      `Chat customer belum dibaca: ${chat.map((c) => `${c.name} (${c.unreadMessages})`).join(", ")}.`,
    );
  return out.join("\n");
}

async function runRefund(): Promise<string> {
  try {
    return formatRefund(await listRefundCustomers(createAdminClient()), currentRefundMonth());
  } catch (e) {
    logger.error("owner-assistant: data refund gagal dibaca", {
      error: e instanceof Error ? e.message : String(e),
    });
    return "[Refund Customer] data tidak tersedia (gagal membaca modul refund)";
  }
}

// ── Loonars Property Intelligence ───────────────────────────────────────

interface PiProperty {
  id: string;
  nama: string;
  jenis: string;
  status: string;
  model: string;
  kota: string;
  pemilik: string;
}

async function runLoonarsProperti(): Promise<string> {
  // pi_* milik repo loonars (Edge Function property-intel), tidak ada di
  // types/database.types.ts repo ini -- dibaca tanpa tipe, kolomnya ditulis di PiProperty.
  const supabase = createAdminClient() as unknown as SupabaseClient;
  const { data: rows, error } = await supabase
    .from("pi_properties")
    .select("id, nama, jenis, status, model, kota, pemilik, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) return `[Properti Loonars] data tidak tersedia (${error.message})`;
  const data = (rows ?? []) as PiProperty[];
  if (!data.length)
    return "[Properti Loonars] Belum ada properti yang dicatat di loonars.id/hitung.";
  const { data: survei } = await supabase
    .from("pi_surveys")
    .select("property_id, status, tanggal")
    .in(
      "property_id",
      data.map((p) => p.id),
    )
    .order("tanggal", { ascending: false });
  const surveiTerakhir = new Map<string, { status: string; tanggal: string | null }>();
  for (const sv of (survei ?? []) as {
    property_id: string;
    status: string;
    tanggal: string | null;
  }[])
    if (!surveiTerakhir.has(sv.property_id)) surveiTerakhir.set(sv.property_id, sv);
  const baris = data.map((p) => {
    const sv = surveiTerakhir.get(p.id);
    return `${p.nama} (${p.jenis}, ${p.kota || "kota belum diisi"}) -- status ${p.status}, model ${p.model}, pemilik ${p.pemilik || "-"}${sv ? `, survei terakhir ${sv.status}${sv.tanggal ? ` ${sv.tanggal}` : ""}` : ", belum disurvei"}`;
  });
  return `[Properti Loonars, ${data.length} terbaru]\n${baris.join("\n")}`;
}

// ── Keuangan MKH Property ───────────────────────────────────────────────

/** Bentuk respons /api/laporan-investor/ringkasan-wa (mkh-properti src/lib/laporan-investor/ringkasan.ts). */
export interface RingkasanKeuangan {
  rentang: string;
  diambil_pada: string;
  gabungan: {
    pendapatan: number;
    beban_pokok: number;
    beban_operasional: number;
    laba_bersih: number;
    total_aset: number;
    total_liabilitas: number;
    total_ekuitas: number;
    kas_akhir: number;
  } | null;
  tren: { periode: string; label: string; pendapatan: number; laba: number; kas: number }[];
  unit: {
    kode: string;
    nama: string;
    jenis: string;
    kota: string | null;
    utang_bank: { jenis: string; bank: string; sisa: number; jatuhTempo: string | null }[];
    bulan: {
      periode: string;
      status: string;
      buku_besar: { pendapatan: number; beban: number; laba: number; kas: number } | null;
      metrik: Record<string, number | null>;
      pendapatan_villa?: { rental: number; non_kamar: number; total: number } | null;
    }[];
  }[];
  temuan: { tingkat: string; unit: string | null; teks: string }[];
}

/** Exported for tests. Copies MKH Property's numbers as-is; a missing metric reads "belum tersedia", never 0. */
export function formatRingkasanKeuangan(r: RingkasanKeuangan): string {
  const out: string[] = [
    `[Keuangan MKH Property, ${r.rentang}] (sumber: Laporan Investor finance.haluoleo.id)`,
  ];
  const g = r.gabungan;
  out.push(
    g
      ? `Gabungan periode: pendapatan ${rupiah(g.pendapatan)}, beban pokok ${rupiah(g.beban_pokok)}, beban operasional ${rupiah(g.beban_operasional)}, laba bersih ${rupiah(g.laba_bersih)}. Posisi akhir: kas ${rupiah(g.kas_akhir)}, aset ${rupiah(g.total_aset)}, liabilitas ${rupiah(g.total_liabilitas)}, ekuitas ${rupiah(g.total_ekuitas)}.`
      : "Gabungan periode: belum ada jurnal di rentang ini.",
  );
  if (r.tren.length) {
    out.push(
      `Per bulan (gabungan): ${r.tren.map((t) => `${t.label} pendapatan ${rupiah(t.pendapatan)}, laba ${rupiah(t.laba)}, kas ${rupiah(t.kas)}`).join("; ")}.`,
    );
  }
  for (const u of r.unit) {
    out.push(`\nUnit bisnis ${u.nama} (${u.kode}${u.kota ? `, ${u.kota}` : ""}):`);
    for (const b of u.bulan) {
      if (b.status === "belum_mulai") continue;
      const m = b.metrik;
      const bb = b.buku_besar
        ? `buku besar pendapatan ${rupiah(b.buku_besar.pendapatan)}, beban ${rupiah(b.buku_besar.beban)}, laba ${rupiah(b.buku_besar.laba)}`
        : "buku besar belum ada";
      const adaMetrik = Object.values(m).some((v) => typeof v === "number");
      const operasi =
        u.jenis !== "operasi_properti"
          ? ""
          : !adaMetrik
            ? "; metrik operasi bulanan (okupansi/ADR) belum tersedia di MKH Property"
            : `; okupansi ${angkaAtau(m.okupansi_unit_total_pct, "%")} (atas unit dijual ${angkaAtau(m.okupansi_unit_dijual_pct, "%")}), malam terjual ${angkaAtau(m.malam_terjual)}, booking ${angkaAtau(m.booking_diakui)}, pendapatan kamar kotor ${rupiah(m.pendapatan_kotor)}, bersih ${rupiah(m.pendapatan_bersih)}, basis investor ${rupiah(m.pendapatan_basis_investor)}, non-kamar ${rupiah(m.pendapatan_walkin)}, ADR ${rupiah(m.adr_kotor)}, RevPAR ${rupiah(m.revpar_kotor)}`;
      const villa = b.pendapatan_villa
        ? `; pendapatan villa (sync bulanan) sewa kamar ${rupiah(b.pendapatan_villa.rental)}, non-kamar ${rupiah(b.pendapatan_villa.non_kamar)}, total ${rupiah(b.pendapatan_villa.total)}`
        : "";
      out.push(`  ${b.periode} [${b.status}]: ${bb}${operasi}${villa}`);
    }
    for (const h of u.utang_bank) {
      out.push(
        `  Utang bank ${h.jenis} ${h.bank}: sisa ${rupiah(h.sisa)}${h.jatuhTempo ? `, jatuh tempo ${h.jatuhTempo}` : ""}`,
      );
    }
  }
  if (r.temuan.length) out.push(`\nCatatan data: ${r.temuan.map((t) => t.teks).join(" | ")}`);
  return out.join("\n");
}

async function runKeuangan(sender: string, dari: string, sampai: string): Promise<string> {
  const { data: secret, error } = await createAdminClient().rpc("get_sync_secret");
  if (error || !secret) {
    logger.error("owner-assistant: rahasia sync tidak tersedia", { error: error?.message });
    return "[Keuangan MKH Property] data tidak tersedia (rahasia sync tidak bisa dibaca)";
  }
  try {
    const res = await fetch(MKH_PROPERTY_RINGKASAN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": secret as string },
      body: JSON.stringify({ nomor: sender, dari, sampai }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      logger.error("owner-assistant: MKH Property menolak ringkasan", { status: res.status });
      return `[Keuangan MKH Property] data tidak tersedia (MKH Property HTTP ${res.status})`;
    }
    return formatRingkasanKeuangan((await res.json()) as RingkasanKeuangan);
  } catch (e) {
    logger.error("owner-assistant: gagal menghubungi MKH Property", {
      error: e instanceof Error ? e.message : String(e),
    });
    return "[Keuangan MKH Property] data tidak tersedia (MKH Property tidak bisa dihubungi)";
  }
}

/** AI CFO MKH Property: jawaban dihitung deterministik di MKH Property (src/lib/cfo), hanya baca. */
async function runAiCfo(sender: string, pertanyaan: string): Promise<string> {
  const { data: secret, error } = await createAdminClient().rpc("get_sync_secret");
  if (error || !secret) {
    logger.error("owner-assistant: rahasia sync tidak tersedia", { error: error?.message });
    return "[AI CFO MKH Property] data tidak tersedia (rahasia sync tidak bisa dibaca)";
  }
  try {
    const res = await fetch(MKH_PROPERTY_CFO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": secret as string },
      body: JSON.stringify({ nomor: sender, pertanyaan: pertanyaan.slice(0, 1000) }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      logger.error("owner-assistant: AI CFO menolak", { status: res.status });
      return `[AI CFO MKH Property] data tidak tersedia (MKH Property HTTP ${res.status})`;
    }
    const j = (await res.json()) as { jawaban?: string; putusan?: string | null };
    if (!j.jawaban) return "[AI CFO MKH Property] data tidak tersedia";
    return `[AI CFO MKH Property${j.putusan ? `, putusan: ${j.putusan.toUpperCase()}` : ""}]\n${j.jawaban}`;
  } catch (e) {
    logger.error("owner-assistant: gagal menghubungi AI CFO", {
      error: e instanceof Error ? e.message : String(e),
    });
    return "[AI CFO MKH Property] data tidak tersedia (MKH Property tidak bisa dihubungi)";
  }
}

async function runLoonars2(
  sender: string,
  aksi: "saldo" | "tagihan" | "daftar_utang" | "daftar_borongan",
  judul: string,
): Promise<string> {
  const teks = await bacaLoonars2(sender, aksi);
  return teks ? `[${judul}]\n${teks}` : `[${judul}] data tidak tersedia`;
}

// ── Percakapan ──────────────────────────────────────────────────────────

async function ambilRiwayat(sender: string): Promise<string> {
  const sejak = new Date(Date.now() - RIWAYAT_JENDELA_MS).toISOString();
  const { data } = await createAdminClient()
    .from("ai_conversations")
    .select("inbound_text, reply_text")
    .eq("sender", sender)
    .gte("created_at", sejak)
    .order("created_at", { ascending: false })
    .limit(RIWAYAT_MAKS_GILIRAN);
  const giliran = (data ?? []).reverse();
  if (!giliran.length) return "";
  const potong = (s: string | null) => (s ?? "").slice(0, 600);
  return giliran
    .map(
      (g) =>
        `Owner: ${potong(g.inbound_text)}\nAsisten: ${potong(g.reply_text) || "(tidak dibalas)"}`,
    )
    .join("\n");
}

export const OWNER_MENU_TEXT = [
  "🤖 *Asisten Owner* -- tanya apa saja soal data sistem, contoh:",
  "",
  "🏡 *Villa*",
  "• okupansi villa hari ini?",
  "• okupansi 7 hari ke depan?",
  "• harga kamar tanggal 25 Oktober?",
  "",
  "💰 *Keuangan (MKH Property)*",
  "• laba bulan ini berapa?",
  "• pendapatan villa bulan ini per channel?",
  "• bagi hasil investor villa bulan lalu?",
  "• kas dan utang bank sekarang?",
  "• saldo / tagihan / utang / upah borongan Loonars 2?",
  "• properti prospek Loonars (loonars.id/hitung)?",
  "",
  "🧠 *AI CFO*",
  "• kapan kas berisiko defisit? kebutuhan dana?",
  "• utang mana yang harus dibayar dulu?",
  "• mau bangun 3 unit lagi 480 jt, boleh?",
  "",
  "👥 *MK Connect*",
  "• siapa yang belum absen hari ini?",
  "• lead minggu ini? performa iklan?",
  "• pengajuan & cuti yang masih pending?",
  "• refund customer bulan ini? sisa refund?",
  "",
  "🧩 *Pertanyaan bebas & gabungan*",
  "• Loonars 2 sudah keluar berapa termasuk Loonars Coffee, dan utangnya?",
  "• rekening C Loonars 2 itu untuk apa?",
  "",
  'Pertanyaan lanjutan juga bisa ("kalau bulan lalu?"). Perintah lama (LUNAS, setujui L2-…, lapkeu, dst.) tetap berjalan seperti biasa.',
].join("\n");

export const OWNER_BELUM_TERSAMBUNG_TEXT =
  "Data untuk pertanyaan itu belum tersambung ke asisten ini, jadi saya tidak bisa menjawabnya dengan angka yang benar. Kirim *menu* untuk melihat data yang sudah bisa ditanyakan, atau minta tim teknis menyambungkan modul tersebut.";

export function isOwnerMenuRequest(text: string): boolean {
  return /^\s*(menu|bantuan|help|\/start)\s*[?!.]*\s*$/i.test(text);
}

async function extractOwnerIntent(
  question: string,
  riwayat: string,
  hariIni: string,
): Promise<OwnerIntent> {
  const katalog = SEMUA_TOOL.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const prompt = `Hari ini ${hariIni} (WIB). Owner perusahaan bertanya lewat WhatsApp.
${riwayat ? `\nPercakapan sebelumnya (untuk memahami pertanyaan lanjutan seperti "kalau bulan lalu?"):\n${riwayat}\n` : ""}
Pertanyaan terbaru: "${question}"

Data yang tersedia (masing-masing "tool" terpisah):
${katalog}

Pengetahuan tentang perusahaan & sistem (untuk memahami istilah dan memilih tool yang tepat):
${PENGETAHUAN_SISTEM}

Tentukan apakah pertanyaan terbaru BUTUH data nyata dari sistem. Kalau ya, pilih SEMUA tool yang dibutuhkan untuk menjawab lengkap (boleh lebih dari satu; pertanyaan gabungan/perbandingan biasanya butuh beberapa tool). Bila pertanyaan hanya tentang cara kerja/aturan/struktur bisnis atau sistem tanpa butuh angka (mis. "rekening C itu untuk apa?", "Loonars Coffee masuk mana?"), isi isSystemQuestion = true. Isi juga parameter bila relevan:
- branchName: nama cabang MK Connect yang disebut (mis. "Jogja", "Kendari"), atau null
- bulanDari/bulanSampai: rentang bulan "YYYY-MM" untuk keuangan_ringkasan dan villa_keuangan (mis. "bulan lalu" = bulan kalender sebelumnya; tidak disebut = null)
- tanggalMulai: "YYYY-MM-DD" tanggal (pertama) untuk okupansi ke depan atau harga kamar (tidak disebut = null, berarti hari ini; "malam minggu" = Sabtu terdekat)
- jumlahHari: jumlah tanggal berurutan untuk okupansi ke depan atau harga kamar (maks ${MAKS_HARI_OKUPANSI}; satu tanggal = 1; tidak disebut = null)

Balas HANYA dengan JSON (tanpa markdown code fence): {"isDataQuestion": true/false, "isSystemQuestion": true/false, "tools": ["nama_tool", ...], "branchName": null, "bulanDari": null, "bulanSampai": null, "tanggalMulai": null, "jumlahHari": null}`;

  try {
    const response = await generateAIText({
      systemPrompt:
        "Kamu adalah pengklasifikasi intent pesan WhatsApp owner perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: prompt,
      maxOutputTokens: 512,
      maxAttempts: 1,
    });
    return parseOwnerIntentJson(response.text);
  } catch {
    return {
      isDataQuestion: false,
      tools: [],
      branchName: null,
      bulanDari: null,
      bulanSampai: null,
      tanggalMulai: null,
      jumlahHari: null,
    };
  }
}

export interface OwnerAssistantResult {
  /** False if the question didn't need data -- caller falls through to the normal chat/file-request flow. */
  applicable: boolean;
  answer: string;
}

const MAKS_PUTARAN_AGEN = 2;

/**
 * Bila jawaban model dua kali memuat angka yang tidak ada di DATA: jangan
 * kirim seluruh data mentah (owner 2026-11-02: "sy bahas apa dia jawab apa").
 * Kirim pengakuan singkat + hanya baris data yang paling relevan dengan kata
 * di pertanyaan (maks 8 baris). Exported for tests.
 */
export function jawabanAman(question: string, data: string[], hariIni: string): string {
  const kata = question
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((k) => k.length >= 4 && !["yang", "ini", "itu", "berapa", "mana", "atau", "sudah", "kamu", "masukkan"].includes(k));
  const barisSkor = data
    .flatMap((d) => d.split("\n"))
    .map((b) => b.trim())
    .filter((b) => b && /\d/.test(b))
    .map((b) => ({ b, skor: kata.filter((k) => b.toLowerCase().includes(k)).length }))
    .filter((x) => x.skor > 0)
    .sort((a, b) => b.skor - a.skor)
    .slice(0, 8)
    .map((x) => x.b);
  return [
    "Maaf, saya belum bisa merangkai jawaban yang angkanya pasti benar untuk pertanyaan ini.",
    ...(barisSkor.length ? ["", `Data sistem yang paling terkait (hari ini ${hariIni}):`, ...barisSkor] : []),
    "",
    "Coba tanyakan lebih spesifik (mis. sebut Loonars 1/Loonars 2/holding dan periodenya).",
  ].join("\n");
}

const SISTEM_JAWAB = `Anda adalah Asisten Owner PT Maha Karya Haluoleo di WhatsApp: asisten yang paham seluruh bisnis dan sistem owner.

PENGETAHUAN SISTEM:
${PENGETAHUAN_SISTEM}

ATURAN KERAS:
- Angka HANYA disalin persis dari DATA. Jangan mengarang, jangan menjumlah/menghitung angka baru. Bila data "tidak tersedia", katakan apa adanya.
- Bila data [AI CFO MKH Property] memuat putusan (AMAN/WASPADA/TIDAK MENYARANKAN), sampaikan apa adanya beserta alasan & alternatifnya -- jangan dilunakkan.
- Anda hanya membaca data. Jangan pernah menyatakan sudah membayar, menyetujui, atau mengubah sesuatu.
- Gunakan pengetahuan untuk menafsirkan data (mis. uang investor Loonars 2 = uang muka, bukan pendapatan; Loonars Coffee bagian dari Loonars 2).
- Jawab singkat, langsung ke inti, Bahasa Indonesia, format WhatsApp (*tebal*, poin), sebutkan periode/tanggal data.`;

interface KonteksTool {
  branchId: string | null;
  branchName: string | null;
  mulai: string;
  jumlahHari: number | null;
  dari: string;
  sampai: string;
}

async function konteksTool(supabase: SupabaseClient, it: OwnerIntent, hariIni: string): Promise<KonteksTool> {
  let branchId: string | null = null;
  if (it.branchName) {
    const { data: branchRow } = await supabase
      .from("branches")
      .select("id")
      .ilike("name", `%${it.branchName}%`)
      .maybeSingle();
    branchId = branchRow?.id ?? null;
  }
  const bulanIni = hariIni.slice(0, 7);
  const sampai = it.bulanSampai ?? it.bulanDari ?? bulanIni;
  const dari = it.bulanDari ?? tambahBulan(sampai, -2);
  return {
    branchId,
    branchName: it.branchName,
    mulai: it.tanggalMulai && it.tanggalMulai >= hariIni ? it.tanggalMulai : hariIni,
    jumlahHari: it.jumlahHari,
    dari: dari <= sampai ? dari : sampai,
    sampai,
  };
}

function kunciTool(t: ToolName, c: KonteksTool): string {
  return [t, c.branchId, c.mulai, c.jumlahHari, c.dari, c.sampai].join("|");
}

function jalankanToolOwner(
  tool: ToolName,
  c: KonteksTool,
  sender: string,
  question: string,
  supabase: SupabaseClient,
): Promise<string> {
  switch (tool) {
    case "villa_okupansi_hari_ini":
      return runVillaHariIni();
    case "villa_okupansi_ke_depan":
      return runVillaKeDepan(c.mulai, c.jumlahHari ?? 7);
    case "villa_harga":
      return runVillaHarga(c.mulai, c.jumlahHari ?? 1);
    case "villa_keuangan":
      return runVillaKeuangan(c.sampai);
    case "refund_customer":
      return runRefund();
    case "loonars_properti":
      return runLoonarsProperti();
    case "keuangan_ringkasan":
      return runKeuangan(sender, c.dari, c.sampai);
    case "loonars2_saldo":
      return runLoonars2(sender, "saldo", "Loonars 2 Saldo");
    case "loonars2_tagihan":
      return runLoonars2(sender, "tagihan", "Loonars 2 Tagihan");
    case "loonars2_utang":
      return runLoonars2(sender, "daftar_utang", "Loonars 2 Utang Toko");
    case "loonars2_borongan":
      return runLoonars2(sender, "daftar_borongan", "Loonars 2 Borongan Tukang");
    case "ai_cfo":
      return runAiCfo(sender, question);
    default:
      return runTool(supabase, tool, c.branchId, c.branchName);
  }
}

/** Langkah agen: setelah melihat DATA, apakah perlu tool lain? Exported for tests via parseOwnerIntentJson. */
async function mintaToolLanjutan(
  question: string,
  riwayat: string,
  hariIni: string,
  dataSudah: string[],
): Promise<OwnerIntent> {
  const katalog = SEMUA_TOOL.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const response = await generateAIText({
    systemPrompt:
      "Kamu adalah perencana data untuk asisten owner. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
    userPrompt: `Hari ini ${hariIni} (WIB).
${riwayat ? `Percakapan sebelumnya:\n${riwayat}\n` : ""}
Pertanyaan owner: "${question}"

Pengetahuan sistem:
${PENGETAHUAN_SISTEM}

Data yang SUDAH diambil:
${dataSudah.join("\n\n").slice(0, 12000)}

Tool yang tersedia:
${katalog}

Apakah data di atas SUDAH cukup untuk menjawab pertanyaan secara lengkap dan benar? Bila belum, sebutkan tool TAMBAHAN yang dibutuhkan (jangan ulang tool yang datanya sudah ada, kecuali dengan parameter berbeda). Bila sudah cukup, tools = [].
Balas HANYA JSON: {"isDataQuestion": true, "tools": [], "branchName": null, "bulanDari": null, "bulanSampai": null, "tanggalMulai": null, "jumlahHari": null}`,
    maxOutputTokens: 384,
    maxAttempts: 1,
  });
  return parseOwnerIntentJson(response.text);
}

/**
 * Owner 2026-11-01: "berapa total pengeluaran loonars 2?" dijawab dari tool
 * borongan + utang toko villa saja, sehingga Loonars Coffee (dibiayai Loonars 2)
 * tidak ikut. Pertanyaan TOTAL pengeluaran/biaya/belanja Loonars 2 selalu
 * diarahkan ke AI CFO (angka gabungan villa + Loonars Coffee). Tool rincian
 * borongan/utang tetap dipakai bila owner memang menanyakan rinciannya.
 */
export function arahkanPengeluaranLoonars2(question: string, intent: OwnerIntent): OwnerIntent {
  const q = question.toLowerCase();
  const soalL2 = /loonars\s*2|\bl2\b|loonars living|coffee|kopi/.test(q);
  const soalPengeluaran = /pengeluaran|belanja|biaya|spending|uang keluar/.test(q);
  if (!soalL2 || !soalPengeluaran) return intent;
  const mintaRincian = /borongan|tukang|mandor|retensi/.test(q);
  const mintaToko = /utang|hutang|toko/.test(q);
  const tools = intent.tools.filter(
    (t) => (t !== "loonars2_borongan" || mintaRincian) && (t !== "loonars2_utang" || mintaToko),
  );
  if (!tools.includes("ai_cfo")) tools.unshift("ai_cfo");
  return { ...intent, isDataQuestion: true, tools };
}

export async function tryOwnerAssistant(
  question: string,
  sender: string,
  opts?: { jobId?: string },
): Promise<OwnerAssistantResult> {
  if (isOwnerMenuRequest(question)) return { applicable: true, answer: OWNER_MENU_TEXT };

  const hariIni = tanggalWib();
  const riwayat = await ambilRiwayat(sender).catch(() => "");
  const intent = arahkanPengeluaranLoonars2(question, await extractOwnerIntent(question, riwayat, hariIni));
  if (!intent.isDataQuestion) {
    if (!intent.isSystemQuestion) return { applicable: false, answer: "" };
    const answer = await askAI(
      `${SISTEM_JAWAB}\n\nPertanyaan ini tentang cara kerja bisnis/sistem: jawab dari PENGETAHUAN saja dan JANGAN menyebut angka nominal apa pun (angka hanya boleh dari data tool, dan tidak ada data tool di sini). Bila pengetahuan tidak mencakup, katakan belum tercatat.`,
      `${riwayat ? `Percakapan sebelumnya:\n${riwayat}\n\n` : ""}Pertanyaan owner: ${question}`,
      { maxAttempts: 1, jobId: opts?.jobId },
    );
    // Tanpa data tool, nominal apa pun pasti karangan → jangan dikirim.
    if (angkaTakBerdasar(answer, question).length) {
      return { applicable: true, answer: OWNER_BELUM_TERSAMBUNG_TEXT };
    }
    return { applicable: true, answer };
  }
  // A data question no tool covers: say so plainly instead of letting the
  // general chat answer "tidak tersedia" as if the data were empty (owner,
  // 2026-10-19: "refund customer knpa tidak tersedia?" before that tool existed).
  if (intent.tools.length === 0) return { applicable: true, answer: OWNER_BELUM_TERSAMBUNG_TEXT };

  const supabase = createAdminClient();
  const sudah = new Map<string, string>();
  const jalankan = async (it: OwnerIntent) => {
    const ctx = await konteksTool(supabase, it, hariIni);
    const baru = it.tools.filter((t) => !sudah.has(kunciTool(t, ctx)));
    const hasil = await Promise.all(
      baru.map((t) =>
        jalankanToolOwner(t, ctx, sender, question, supabase).catch(
          (err: unknown) => `[${t}] data tidak tersedia (${err instanceof Error ? err.message : "gagal"})`,
        ),
      ),
    );
    baru.forEach((t, n) => sudah.set(kunciTool(t, ctx), hasil[n]));
    return baru.length;
  };
  await jalankan(intent);

  // Agen: model boleh meminta data tambahan (maks 2 putaran) setelah melihat
  // data yang sudah ada -- mis. pertanyaan perbandingan/gabungan lintas modul.
  for (let putaran = 0; putaran < MAKS_PUTARAN_AGEN; putaran++) {
    const lanjut = await mintaToolLanjutan(question, riwayat, hariIni, [...sudah.values()]).catch(() => null);
    if (!lanjut || lanjut.tools.length === 0) break;
    if ((await jalankan(lanjut)) === 0) break;
  }

  const data = [...sudah.values()].join("\n\n");
  const userPrompt = `${riwayat ? `Percakapan sebelumnya:\n${riwayat}\n\n` : ""}Pertanyaan owner: ${question}\n\nDATA dari sistem (hari ini ${hariIni}):\n${data}`;
  let answer = await askAI(SISTEM_JAWAB, userPrompt, { maxAttempts: 1, jobId: opts?.jobId });

  // Penjaga angka: nominal yang tidak ada di DATA → minta ulang sekali; bila
  // masih, kirim data apa adanya (lebih baik kaku daripada angka karangan).
  let tak = angkaTakBerdasar(answer, `${data}\n${question}`);
  if (tak.length) {
    logger.warn("owner-assistant: angka tak berdasar, diulang", { jumlah: tak.length });
    answer = await askAI(
      `${SISTEM_JAWAB}\n\nPERINGATAN: jawaban sebelumnya memuat angka yang TIDAK ada di DATA (${tak.slice(0, 5).map((n) => n.toLocaleString("id-ID")).join(", ")}). Tulis ulang: salin angka persis dari DATA, jangan menjumlah/menghitung sendiri.`,
      userPrompt,
      { maxAttempts: 1, jobId: opts?.jobId },
    );
    tak = angkaTakBerdasar(answer, `${data}\n${question}`);
    if (tak.length) {
      answer = jawabanAman(question, [...sudah.values()], hariIni);
    }
  }

  return { applicable: true, answer };
}
