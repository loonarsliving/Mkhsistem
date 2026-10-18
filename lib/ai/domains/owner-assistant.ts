import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { getOccupancyProvider } from "@/lib/occupancy/villa-provider";

import { askAI, generateAIText } from "../service";
import { QUERY_TOOL_CATALOG, runTool, type QueryToolName } from "./data-queries";
import { bacaLoonars2 } from "./loonars2-wa";

/**
 * Asisten WhatsApp owner (owner 2026-10-18: "jadikan WhatsApp saya dashboard
 * utama ... cukup saya saja yang punya akses"). Chatbot tanya-jawab lintas
 * keempat sistem untuk SUPER ADMIN saja:
 *
 *   - MK Connect      -> tool data-queries.ts yang sudah ada (lead, iklan,
 *                        saldo cabang, pengajuan, absensi, cuti, Markom)
 *   - Villa           -> okupansi hari ini & ke depan dari villa-api
 *                        (lib/occupancy/villa-provider.ts, GET saja)
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

const MKH_PROPERTY_RINGKASAN_URL = "https://finance.haluoleo.id/api/laporan-investor/ringkasan-wa";
const MAKS_HARI_OKUPANSI = 14;
const RIWAYAT_MAKS_GILIRAN = 6;
const RIWAYAT_JENDELA_MS = 3 * 60 * 60 * 1000;

type OwnerToolName = "villa_okupansi_hari_ini" | "villa_okupansi_ke_depan" | "keuangan_ringkasan" | "loonars2_saldo" | "loonars2_tagihan" | "loonars2_utang";
type ToolName = QueryToolName | OwnerToolName;

const OWNER_TOOL_CATALOG: { name: OwnerToolName; description: string }[] = [
  { name: "villa_okupansi_hari_ini", description: "Villa Loonars Private Living hari ini: unit terisi/kosong/kotor, check-in & check-out hari ini, persen okupansi" },
  {
    name: "villa_okupansi_ke_depan",
    description: `Villa: okupansi per tanggal ke depan per tipe kamar (maks ${MAKS_HARI_OKUPANSI} hari), dari ketersediaan yang dijual di website`,
  },
  {
    name: "keuangan_ringkasan",
    description:
      "Keuangan MKH Property per bulan: pendapatan, beban, laba bersih, kas, aset, liabilitas, utang bank; plus per unit bisnis (villa, proyek) okupansi bulanan, malam terjual, pendapatan kamar kotor/bersih, ADR, RevPAR",
  },
  { name: "loonars2_saldo", description: "Loonars 2: saldo 4 rekening (A-D) dan status pendanaan unit" },
  { name: "loonars2_tagihan", description: "Loonars 2: tagihan/pembayaran pembeli unit yang belum lunas" },
  { name: "loonars2_utang", description: "Loonars 2: daftar sisa utang toko bangunan" },
];

const SEMUA_TOOL: { name: ToolName; description: string }[] = [...QUERY_TOOL_CATALOG, ...OWNER_TOOL_CATALOG];

export interface OwnerIntent {
  isDataQuestion: boolean;
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
    tools: Array.isArray(p.tools) ? p.tools.filter((t): t is ToolName => SEMUA_TOOL.some((c) => c.name === t)) : [],
    branchName: typeof p.branchName === "string" && p.branchName.trim() ? p.branchName.trim() : null,
    bulanDari: bulan(p.bulanDari),
    bulanSampai: bulan(p.bulanSampai),
    tanggalMulai: typeof p.tanggalMulai === "string" && POLA_TANGGAL.test(p.tanggalMulai) ? p.tanggalMulai : null,
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
  const { data: role } = await supabase.from("roles").select("id").eq("key", "super_admin").maybeSingle();
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
  return typeof n === "number" && Number.isFinite(n) ? `Rp${Math.round(n).toLocaleString("id-ID")}` : "belum tersedia";
}

function angkaAtau(n: number | null | undefined, satuan = ""): string {
  return typeof n === "number" && Number.isFinite(n) ? `${n.toLocaleString("id-ID")}${satuan}` : "belum tersedia";
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
    const rinci = tipe.map((t) => `${t.roomTypeName} ${t.occupiedUnits}/${t.totalUnits}`).join(", ");
    return `${tanggal}: ${terisi}/${total} terisi (${persen}%) -- ${rinci}`;
  });
  return `[Villa Okupansi ke Depan] (dari ketersediaan yang dijual di website/villa-api; unit yang ditutup ikut terhitung terisi)\n${baris.join("\n")}`;
}

async function runVillaKeDepan(mulai: string, jumlahHari: number): Promise<string> {
  const r = await getOccupancyProvider().getForwardAvailability(mulai, tambahHari(mulai, jumlahHari));
  if (!r.ok) return `[Villa Okupansi ke Depan] data tidak tersedia (${r.reason})`;
  return formatOkupansiKeDepan(r.data);
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
  const out: string[] = [`[Keuangan MKH Property, ${r.rentang}] (sumber: Laporan Investor finance.haluoleo.id)`];
  const g = r.gabungan;
  out.push(
    g
      ? `Gabungan periode: pendapatan ${rupiah(g.pendapatan)}, beban pokok ${rupiah(g.beban_pokok)}, beban operasional ${rupiah(g.beban_operasional)}, laba bersih ${rupiah(g.laba_bersih)}. Posisi akhir: kas ${rupiah(g.kas_akhir)}, aset ${rupiah(g.total_aset)}, liabilitas ${rupiah(g.total_liabilitas)}, ekuitas ${rupiah(g.total_ekuitas)}.`
      : "Gabungan periode: belum ada jurnal di rentang ini.",
  );
  if (r.tren.length) {
    out.push(`Per bulan (gabungan): ${r.tren.map((t) => `${t.label} pendapatan ${rupiah(t.pendapatan)}, laba ${rupiah(t.laba)}, kas ${rupiah(t.kas)}`).join("; ")}.`);
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
      out.push(`  Utang bank ${h.jenis} ${h.bank}: sisa ${rupiah(h.sisa)}${h.jatuhTempo ? `, jatuh tempo ${h.jatuhTempo}` : ""}`);
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
    logger.error("owner-assistant: gagal menghubungi MKH Property", { error: e instanceof Error ? e.message : String(e) });
    return "[Keuangan MKH Property] data tidak tersedia (MKH Property tidak bisa dihubungi)";
  }
}

async function runLoonars2(sender: string, aksi: "saldo" | "tagihan" | "daftar_utang", judul: string): Promise<string> {
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
  return giliran.map((g) => `Owner: ${potong(g.inbound_text)}\nAsisten: ${potong(g.reply_text) || "(tidak dibalas)"}`).join("\n");
}

export const OWNER_MENU_TEXT = [
  "🤖 *Asisten Owner* -- tanya apa saja soal data sistem, contoh:",
  "",
  "🏡 *Villa*",
  "• okupansi villa hari ini?",
  "• okupansi 7 hari ke depan?",
  "",
  "💰 *Keuangan (MKH Property)*",
  "• laba bulan ini berapa?",
  "• pendapatan villa bulan lalu dan ADR-nya?",
  "• kas dan utang bank sekarang?",
  "• saldo / tagihan / utang Loonars 2?",
  "",
  "👥 *MK Connect*",
  "• siapa yang belum absen hari ini?",
  "• lead minggu ini? performa iklan?",
  "• pengajuan & cuti yang masih pending?",
  "",
  "Pertanyaan lanjutan juga bisa (\"kalau bulan lalu?\"). Perintah lama (LUNAS, setujui L2-…, lapkeu, dst.) tetap berjalan seperti biasa.",
].join("\n");

export function isOwnerMenuRequest(text: string): boolean {
  return /^\s*(menu|bantuan|help|\/start)\s*[?!.]*\s*$/i.test(text);
}

async function extractOwnerIntent(question: string, riwayat: string, hariIni: string): Promise<OwnerIntent> {
  const katalog = SEMUA_TOOL.map((t) => `- ${t.name}: ${t.description}`).join("\n");
  const prompt = `Hari ini ${hariIni} (WIB). Owner perusahaan bertanya lewat WhatsApp.
${riwayat ? `\nPercakapan sebelumnya (untuk memahami pertanyaan lanjutan seperti "kalau bulan lalu?"):\n${riwayat}\n` : ""}
Pertanyaan terbaru: "${question}"

Data yang tersedia (masing-masing "tool" terpisah):
${katalog}

Tentukan apakah pertanyaan terbaru BUTUH data nyata dari sistem. Kalau ya, pilih tool yang relevan (boleh lebih dari satu). Isi juga parameter bila relevan:
- branchName: nama cabang MK Connect yang disebut (mis. "Jogja", "Kendari"), atau null
- bulanDari/bulanSampai: rentang bulan "YYYY-MM" untuk keuangan_ringkasan (mis. "bulan lalu" = bulan kalender sebelumnya; tidak disebut = null)
- tanggalMulai: "YYYY-MM-DD" awal okupansi ke depan (tidak disebut = null, berarti hari ini)
- jumlahHari: jumlah hari okupansi ke depan (maks ${MAKS_HARI_OKUPANSI}; tidak disebut = null)

Balas HANYA dengan JSON (tanpa markdown code fence): {"isDataQuestion": true/false, "tools": ["nama_tool", ...], "branchName": null, "bulanDari": null, "bulanSampai": null, "tanggalMulai": null, "jumlahHari": null}`;

  try {
    const response = await generateAIText({
      systemPrompt: "Kamu adalah pengklasifikasi intent pesan WhatsApp owner perusahaan. Balas HANYA dengan JSON sesuai instruksi, tanpa penjelasan tambahan.",
      userPrompt: prompt,
      maxOutputTokens: 512,
      maxAttempts: 1,
    });
    return parseOwnerIntentJson(response.text);
  } catch {
    return { isDataQuestion: false, tools: [], branchName: null, bulanDari: null, bulanSampai: null, tanggalMulai: null, jumlahHari: null };
  }
}

export interface OwnerAssistantResult {
  /** False if the question didn't need data -- caller falls through to the normal chat/file-request flow. */
  applicable: boolean;
  answer: string;
}

export async function tryOwnerAssistant(question: string, sender: string, opts?: { jobId?: string }): Promise<OwnerAssistantResult> {
  if (isOwnerMenuRequest(question)) return { applicable: true, answer: OWNER_MENU_TEXT };

  const hariIni = tanggalWib();
  const riwayat = await ambilRiwayat(sender).catch(() => "");
  const intent = await extractOwnerIntent(question, riwayat, hariIni);
  if (!intent.isDataQuestion || intent.tools.length === 0) return { applicable: false, answer: "" };

  const supabase = createAdminClient();
  let branchId: string | null = null;
  if (intent.branchName) {
    const { data: branchRow } = await supabase.from("branches").select("id").ilike("name", `%${intent.branchName}%`).maybeSingle();
    branchId = branchRow?.id ?? null;
  }

  const bulanIni = hariIni.slice(0, 7);
  const sampai = intent.bulanSampai ?? intent.bulanDari ?? bulanIni;
  const dari = intent.bulanDari ?? tambahBulan(sampai, -2);
  const mulai = intent.tanggalMulai && intent.tanggalMulai >= hariIni ? intent.tanggalMulai : hariIni;

  const hasil = await Promise.all(
    intent.tools.map((tool): Promise<string> => {
      switch (tool) {
        case "villa_okupansi_hari_ini":
          return runVillaHariIni();
        case "villa_okupansi_ke_depan":
          return runVillaKeDepan(mulai, intent.jumlahHari ?? 7);
        case "keuangan_ringkasan":
          return runKeuangan(sender, dari <= sampai ? dari : sampai, sampai);
        case "loonars2_saldo":
          return runLoonars2(sender, "saldo", "Loonars 2 Saldo");
        case "loonars2_tagihan":
          return runLoonars2(sender, "tagihan", "Loonars 2 Tagihan");
        case "loonars2_utang":
          return runLoonars2(sender, "daftar_utang", "Loonars 2 Utang Toko");
        default:
          return runTool(supabase, tool, branchId, intent.branchName);
      }
    }),
  );

  const answer = await askAI(
    "Anda adalah asisten pribadi owner PT Maha Karya Haluoleo di WhatsApp. Jawab HANYA berdasarkan DATA NYATA di bawah -- jangan mengarang angka, jangan menghitung angka baru yang tidak ada di data, dan salin angka persis. Bila suatu data tertulis \"tidak tersedia\" atau \"belum tersedia\", katakan itu apa adanya, jangan ditebak. Jawab singkat dan langsung ke inti dalam Bahasa Indonesia, format WhatsApp (boleh *tebal* dan poin), sebutkan periode/tanggal datanya.",
    `${riwayat ? `Percakapan sebelumnya:\n${riwayat}\n\n` : ""}Pertanyaan owner: ${question}\n\nData dari sistem (hari ini ${hariIni}):\n${hasil.join("\n\n")}`,
    { maxAttempts: 1, jobId: opts?.jobId },
  );

  return { applicable: true, answer };
}
