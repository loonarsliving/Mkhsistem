/**
 * Ringkasan pendapatan & harga villa untuk Loonars AI Advisor (otak AI CFO
 * MKH Property — owner 2026-11-14: "strategi harga untuk membantu mesin harga
 * di repo villa menentukan harga").
 *
 * HANYA MEMBACA tabel villa (bookings, units, villa_room_types, villa_rates,
 * villa_competitor_rates, villa_pricing_settings, villa_pricing_recommendations,
 * villa_high_season_periods). Tidak ada yang ditulis — advisor hanya
 * MEREKOMENDASIKAN; harga tetap ditentukan mesin harga villa + persetujuan
 * owner. Semua angka dihitung di sini (pola FRIDAY), bukan oleh model.
 *
 * Definisi mengikuti mesin harga villa (src/lib/aiPricingEngine.ts):
 * malam terjual = booking berstatus terjadwal/checkin/checkout yang menempati
 * malam itu (tgl_checkin ≤ malam < tgl_checkout). Malam tersedia = jumlah unit
 * properti × hari (unit maintenance tetap dihitung — estimasi, sama dengan
 * catatan F-3 AI CFO). Tanpa data pribadi tamu.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const STATUS_TERJUAL = ["terjadwal", "checkin", "checkout"] as const;

export interface BookingRow {
  unit_id: string | null;
  status: string;
  tgl_checkin: string;
  tgl_checkout: string | null;
  tarif: number | string | null;
  property_kode: string | null;
}
export interface UnitRow {
  id: string;
  status: string | null;
  room_type_id: string | null;
  property_kode: string | null;
}
export interface RoomTypeRow {
  id: string;
  code: string;
  name: string;
  property_kode: string | null;
  base_rate: number | string | null;
  min_rate: number | string | null;
  max_rate: number | string | null;
  active: boolean;
}
export interface RateRow {
  room_type_id: string;
  date: string;
  rate: number | string;
}
export interface CompetitorRow {
  room_type_id: string | null;
  location_label: string;
  competitor_type: string;
  price: number | string;
  observed_at: string;
}
export interface RecommendationRow {
  status: string;
  delta_pct: number | string | null;
  generated_at: string;
}
export interface SettingRow {
  high_occupancy_threshold_pct: number | string | null;
  low_occupancy_threshold_pct: number | string | null;
  max_daily_movement_pct: number | string | null;
  ai_autopush_enabled: boolean | null;
  active: boolean | null;
}
export interface SeasonRow {
  label: string;
  start_date: string;
  end_date: string;
  suggested_adjustment_pct: number | string | null;
  active: boolean | null;
}

export interface Periode {
  label: string;
  dari: string;
  sampai: string;
  malamTersedia: number;
  malamTerjual: number;
  okupansiPct: number | null;
  adr: number | null;
  revpar: number | null;
}

export interface RingkasanTipe {
  kode: string;
  nama: string;
  unit: number;
  batas: { dasar: number | null; min: number | null; maks: number | null };
  harga30Hari: { hari: number; min: number | null; median: number | null; maks: number | null };
  kompetitor60Hari: { n: number; median: number | null; min: number | null; maks: number | null; terakhir: string | null; lokasi: string[] };
}

export interface RingkasanProperti {
  kode: string;
  unit: number;
  unitMaintenance: number;
  lalu30Hari: Periode;
  kedepan: Periode[];
  tipe: RingkasanTipe[];
}

export interface RingkasanHarga {
  hariIni: string;
  properti: RingkasanProperti[];
  mesin: {
    ambangOkupansiTinggiPct: number | null;
    ambangOkupansiRendahPct: number | null;
    gerakHarianMaksPct: number | null;
    autopushAktif: boolean | null;
    rekomendasi30Hari: Record<string, number>;
    rataDeltaPct30Hari: number | null;
  };
  musimRamai: { label: string; dari: string; sampai: string; saranPenyesuaianPct: number | null }[];
  sumber: Record<string, { ok: boolean; error?: string; baris?: number }>;
  catatan: string[];
}

const n = (v: unknown): number | null => {
  const x = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(x) ? x : null;
};
const bulat = (v: number | null) => (v === null ? null : Math.round(v));
const satuDesimal = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

export function tambahHari(tgl: string, hari: number): string {
  const d = new Date(`${tgl}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + hari);
  return d.toISOString().slice(0, 10);
}

function selisihHari(dari: string, sampai: string): number {
  return Math.round((Date.parse(`${sampai}T00:00:00Z`) - Date.parse(`${dari}T00:00:00Z`)) / 86400000);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Okupansi & ADR untuk malam [dari, sampai] (inklusif). */
export function hitungPeriode(label: string, dari: string, sampai: string, unit: number, booking: BookingRow[]): Periode {
  const hari = selisihHari(dari, sampai) + 1;
  const malamTersedia = Math.max(0, unit * hari);
  let malamTerjual = 0;
  let pendapatan = 0;
  for (const b of booking) {
    if (!(STATUS_TERJUAL as readonly string[]).includes(b.status)) continue;
    const masuk = b.tgl_checkin;
    const keluar = b.tgl_checkout ?? tambahHari(b.tgl_checkin, 1);
    const awal = masuk > dari ? masuk : dari;
    const akhirEksklusif = keluar < tambahHari(sampai, 1) ? keluar : tambahHari(sampai, 1);
    const malam = selisihHari(awal, akhirEksklusif);
    if (malam <= 0) continue;
    malamTerjual += malam;
    pendapatan += (n(b.tarif) ?? 0) * malam;
  }
  const okupansi = malamTersedia ? (malamTerjual / malamTersedia) * 100 : null;
  return {
    label,
    dari,
    sampai,
    malamTersedia,
    malamTerjual,
    okupansiPct: satuDesimal(okupansi),
    adr: malamTerjual ? bulat(pendapatan / malamTerjual) : null,
    revpar: malamTersedia ? bulat(pendapatan / malamTersedia) : null,
  };
}

function akhirBulan(tgl: string): string {
  const d = new Date(`${tgl.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

export interface MasukanHarga {
  hariIni: string;
  booking: BookingRow[];
  unit: UnitRow[];
  tipe: RoomTypeRow[];
  harga: RateRow[];
  kompetitor: CompetitorRow[];
  rekomendasi: RecommendationRow[];
  setelan: SettingRow[];
  musim: SeasonRow[];
  sumber: RingkasanHarga["sumber"];
}

/** Fungsi murni: semua angka ringkasan harga. */
export function susunRingkasanHarga(m: MasukanHarga): RingkasanHarga {
  const h = m.hariIni;
  const kodeProperti = [...new Set(m.unit.map((u) => u.property_kode ?? "PL"))].sort();
  const properti: RingkasanProperti[] = kodeProperti.map((kode) => {
    const unit = m.unit.filter((u) => (u.property_kode ?? "PL") === kode);
    const idUnit = new Set(unit.map((u) => u.id));
    const booking = m.booking.filter((b) => b.unit_id && idUnit.has(b.unit_id));
    // Tiga bulan ke depan: sisa bulan ini + dua bulan berikutnya (on the books).
    const kedepan: Periode[] = [];
    let mulai = h;
    for (let i = 0; i < 3; i++) {
      const akhir = akhirBulan(mulai);
      kedepan.push(hitungPeriode(`OTB ${mulai.slice(0, 7)}`, mulai, akhir, unit.length, booking));
      mulai = tambahHari(akhir, 1);
    }
    const tipe = m.tipe
      .filter((t) => t.active && (t.property_kode ?? "PL") === kode)
      .map((t): RingkasanTipe => {
        const harga = m.harga.filter((r) => r.room_type_id === t.id && r.date >= h && r.date <= tambahHari(h, 29)).map((r) => n(r.rate)).filter((x): x is number => x !== null);
        const komp = m.kompetitor.filter((c) => c.room_type_id === t.id && c.observed_at >= tambahHari(h, -60));
        const kp = komp.map((c) => n(c.price)).filter((x): x is number => x !== null);
        return {
          kode: t.code,
          nama: t.name,
          unit: unit.filter((u) => u.room_type_id === t.id).length,
          batas: { dasar: n(t.base_rate), min: n(t.min_rate), maks: n(t.max_rate) },
          harga30Hari: { hari: harga.length, min: harga.length ? Math.min(...harga) : null, median: bulat(median(harga)), maks: harga.length ? Math.max(...harga) : null },
          kompetitor60Hari: {
            n: kp.length,
            median: bulat(median(kp)),
            min: kp.length ? Math.min(...kp) : null,
            maks: kp.length ? Math.max(...kp) : null,
            terakhir: komp.map((c) => c.observed_at).sort().at(-1) ?? null,
            lokasi: [...new Set(komp.map((c) => c.location_label))].slice(0, 8),
          },
        };
      });
    return {
      kode,
      unit: unit.length,
      unitMaintenance: unit.filter((u) => u.status === "maintenance").length,
      lalu30Hari: hitungPeriode("30 hari terakhir", tambahHari(h, -30), tambahHari(h, -1), unit.length, booking),
      kedepan,
      tipe,
    };
  });

  const s = m.setelan.find((x) => x.active) ?? m.setelan[0];
  const rek30 = m.rekomendasi.filter((r) => r.generated_at.slice(0, 10) >= tambahHari(h, -30));
  const perStatus: Record<string, number> = {};
  for (const r of rek30) perStatus[r.status] = (perStatus[r.status] ?? 0) + 1;
  const delta = rek30.map((r) => n(r.delta_pct)).filter((x): x is number => x !== null);

  const catatan: string[] = [
    "Malam tersedia = unit × hari (unit maintenance ikut dihitung) — estimasi.",
    "ADR = tarif per malam yang tercatat di booking; komisi OTA belum dipotong.",
  ];
  for (const p of properti) if (p.unit && p.unitMaintenance === p.unit) catatan.push(`Semua unit ${p.kode} berstatus maintenance (belum beroperasi) — okupansinya belum bermakna.`);

  return {
    hariIni: h,
    properti,
    mesin: {
      ambangOkupansiTinggiPct: n(s?.high_occupancy_threshold_pct),
      ambangOkupansiRendahPct: n(s?.low_occupancy_threshold_pct),
      gerakHarianMaksPct: s ? satuDesimal((n(s.max_daily_movement_pct) ?? 0) * 100) : null,
      autopushAktif: s?.ai_autopush_enabled ?? null,
      rekomendasi30Hari: perStatus,
      rataDeltaPct30Hari: delta.length ? satuDesimal((delta.reduce((a, b) => a + b, 0) / delta.length) * 100) : null,
    },
    musimRamai: m.musim
      .filter((x) => x.active !== false && x.end_date >= h && x.start_date <= tambahHari(h, 120))
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .map((x) => ({ label: x.label, dari: x.start_date, sampai: x.end_date, saranPenyesuaianPct: (() => { const v = n(x.suggested_adjustment_pct); return v === null ? null : satuDesimal(Math.abs(v) <= 1 ? v * 100 : v); })() })),
    sumber: m.sumber,
    catatan,
  };
}

async function ambil<T>(sumber: RingkasanHarga["sumber"], nama: string, q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  try {
    const { data, error } = await q;
    if (error) {
      sumber[nama] = { ok: false, error: error.message.slice(0, 160) };
      return [];
    }
    sumber[nama] = { ok: true, baris: data?.length ?? 0 };
    return data ?? [];
  } catch (e) {
    sumber[nama] = { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : String(e) };
    return [];
  }
}

export async function ringkasanHarga(admin: SupabaseClient, hariIni: string): Promise<RingkasanHarga> {
  const sumber: RingkasanHarga["sumber"] = {};
  const dari = tambahHari(hariIni, -31);
  const sampai = tambahHari(hariIni, 100);
  const booking: BookingRow[] = [];
  for (let hal = 0; hal < 10; hal++) {
    const potong = await ambil<BookingRow>(
      sumber,
      "booking",
      admin
        .from("bookings")
        .select("unit_id, status, tgl_checkin, tgl_checkout, tarif, property_kode")
        .in("status", [...STATUS_TERJUAL])
        .lte("tgl_checkin", sampai)
        .or(`tgl_checkout.gte.${dari},tgl_checkout.is.null`)
        .order("tgl_checkin", { ascending: true })
        .range(hal * 1000, hal * 1000 + 999),
    );
    booking.push(...potong);
    if (potong.length < 1000) break;
  }
  if (sumber.booking?.ok) sumber.booking.baris = booking.length;

  const [unit, tipe, harga, kompetitor, rekomendasi, setelan, musim] = await Promise.all([
    ambil<UnitRow>(sumber, "unit", admin.from("units").select("id, status, room_type_id, property_kode")),
    ambil<RoomTypeRow>(sumber, "tipe_kamar", admin.from("villa_room_types").select("id, code, name, property_kode, base_rate, min_rate, max_rate, active")),
    ambil<RateRow>(sumber, "harga", admin.from("villa_rates").select("room_type_id, date, rate").gte("date", hariIni).lte("date", tambahHari(hariIni, 29)).limit(5000)),
    ambil<CompetitorRow>(sumber, "kompetitor", admin.from("villa_competitor_rates").select("room_type_id, location_label, competitor_type, price, observed_at").is("stay_date", null).gte("observed_at", tambahHari(hariIni, -60)).limit(2000)),
    ambil<RecommendationRow>(sumber, "rekomendasi_mesin", admin.from("villa_pricing_recommendations").select("status, delta_pct, generated_at").gte("generated_at", `${tambahHari(hariIni, -30)}T00:00:00+07:00`).limit(5000)),
    ambil<SettingRow>(sumber, "setelan_mesin", admin.from("villa_pricing_settings").select("high_occupancy_threshold_pct, low_occupancy_threshold_pct, max_daily_movement_pct, ai_autopush_enabled, active")),
    ambil<SeasonRow>(sumber, "musim_ramai", admin.from("villa_high_season_periods").select("label, start_date, end_date, suggested_adjustment_pct, active")),
  ]);
  return susunRingkasanHarga({ hariIni, booking, unit, tipe, harga, kompetitor, rekomendasi, setelan, musim, sumber });
}
