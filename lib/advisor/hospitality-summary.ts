/**
 * Ringkasan operasional hospitality untuk Loonars AI Advisor (kursi
 * "Manager Hospitality AI", D-2026-009). HANYA MEMBACA: laporan harian
 * Loonars Connect (mkc_hosp_reports), checklist staf, tugas kamar, masalah,
 * pengecekan kamar villa (villa_room_checks), dan chat WA tamu
 * (wa_conversations / wa_conversation_messages). Tidak ada tabel yang
 * ditulis, tidak ada AI MK Connect yang dipakai.
 *
 * Semua angka dihitung di sini (pola FRIDAY: angka di kode, bukan model).
 * Data pribadi diperkecil: staf hanya nama depan; tamu tanpa nama/nomor,
 * dan isi chat contoh disamarkan (nomor, email, tautan).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChecklistRow {
  kind: string;
  result: string;
  submitted_by: string;
  report_date: string;
}
export interface TaskRow {
  status: string;
  completion_source: string | null;
  rework_count: number;
  submitted_by: string | null;
  inspected_by: string | null;
  started_at: string | null;
  submitted_at: string | null;
  inspected_at: string | null;
}
export interface IssueRow {
  category: string;
  severity: string;
  status: string;
  assigned_to: string | null;
  target_at: string | null;
  resolved_at: string | null;
}
export interface RoomCheckRow {
  hasil: string;
  dicek_oleh_nama: string | null;
  property_kode: string | null;
}
export interface EodReportRow {
  report_date: string;
  data: {
    exceptions?: {
      missingReports?: { kind: string; label: string; expected: number; submitted: number }[];
      incompleteChecklists?: unknown[];
      missingVerification?: unknown[];
      guestComplaints?: unknown[];
      overdueItems?: unknown[];
      failedSources?: unknown[];
    };
  } | null;
}
export interface ChatMessageRow {
  conversation_id: string;
  arah: string;
  isi: string | null;
  terjemahan: string | null;
  is_perintah_otomatis: boolean | null;
  created_at: string;
}
export interface ConversationRow {
  id: string;
  status_tamu: string | null;
  ai_kategori: string | null;
  property_kode: string | null;
}

export interface RingkasanHospitality {
  periode: { dari: string; sampai: string };
  sumber: Record<string, { ok: boolean; error?: string; baris?: number }>;
  laporanHarian: {
    hariDenganLaporan: number;
    laporanTerlewat: { label: string; diharapkan: number; dikirim: number }[];
    checklistBelumLengkap: number;
    selesaiTanpaVerifikasiFo: number;
    keluhanTamu: number;
    itemTerlambatMaks: number;
  };
  checklistPerStaf: { nama: string; total: number; perJenis: Record<string, number>; gagalAtauMasalah: number }[];
  tugasKamar: {
    total: number;
    selesai: number;
    lewatAppVillaTanpaFo: number;
    totalBersihUlang: number;
    perCleaning: { nama: string; dikirim: number; bersihUlang: number; medianMenitBersih: number | null }[];
    perFo: { nama: string; inspeksi: number; medianMenitTungguInspeksi: number | null }[];
  };
  masalah: { total: number; terbuka: number; terlambat: number; tanpaPenanggungJawab: number; perKategori: Record<string, number> };
  pengecekanKamarVilla: { total: number; perHasil: Record<string, number>; perPengecek: Record<string, number> };
  chatTamu: {
    percakapanAktif: number;
    pesanMasuk: number;
    balasanStaf: number;
    balasanOtomatis: number;
    medianMenitBalas: number | null;
    p90MenitBalas: number | null;
    tidakDibalas2Jam: number;
    perStatusTamu: Record<string, number>;
    perKategoriAi: Record<string, number>;
    contohPesanTamu: string[];
  };
  catatan: string[];
}

const LABEL_JENIS: Record<string, string> = {
  cleaning: "cleaning",
  fo_inspection: "inspeksi FO",
  security_shift_start: "security awal shift",
  security_late_checkin: "security check-in malam",
  security_patrol: "security patroli",
  security_shift_end: "security akhir shift",
};

export function namaDepan(full: string | null | undefined): string {
  const n = (full ?? "").trim().split(/\s+/)[0];
  return n || "(tanpa nama)";
}

/** Samarkan data pribadi di isi chat tamu sebelum keluar dari MK Connect. */
export function samarkanChat(teks: string): string {
  return teks
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/https?:\/\/\S+/gi, "[tautan]")
    .replace(/\+?\d[\d\s.-]{4,}\d/g, (m) => (m.replace(/\D/g, "").length >= 6 ? "[nomor]" : m))
    .replace(/\s+/g, " ")
    .trim();
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2);
}
function persentil(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]);
}
function menit(dari: string | null, ke: string | null): number | null {
  if (!dari || !ke) return null;
  const d = (Date.parse(ke) - Date.parse(dari)) / 60000;
  return Number.isFinite(d) && d >= 0 ? d : null;
}
function hitung<T>(xs: T[], kunci: (x: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const x of xs) out[kunci(x)] = (out[kunci(x)] ?? 0) + 1;
  return out;
}

/** Waktu balas: untuk setiap rangkaian pesan masuk tamu, menit sampai pesan keluar pertama sesudahnya. */
export function waktuBalas(pesan: ChatMessageRow[], sekarang: Date): { menit: number[]; tidakDibalas2Jam: number } {
  const perPercakapan = new Map<string, ChatMessageRow[]>();
  for (const p of pesan) {
    const arr = perPercakapan.get(p.conversation_id) ?? [];
    arr.push(p);
    perPercakapan.set(p.conversation_id, arr);
  }
  const hasil: number[] = [];
  let tidak = 0;
  for (const arr of perPercakapan.values()) {
    arr.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    let tungguSejak: string | null = null;
    for (const p of arr) {
      if (p.arah === "masuk") {
        tungguSejak ??= p.created_at;
      } else if (p.arah === "keluar" && tungguSejak) {
        const m = menit(tungguSejak, p.created_at);
        if (m !== null) {
          hasil.push(m);
          if (m > 120) tidak++;
        }
        tungguSejak = null;
      }
    }
    if (tungguSejak && (sekarang.getTime() - Date.parse(tungguSejak)) / 60000 > 120) tidak++;
  }
  return { menit: hasil, tidakDibalas2Jam: tidak };
}

/** Contoh pesan tamu tersebar merata sepanjang periode (maks n), disamarkan. */
export function contohPesan(pesan: ChatMessageRow[], n = 120): string[] {
  const masuk = pesan
    .filter((p) => p.arah === "masuk")
    .map((p) => samarkanChat((p.terjemahan || p.isi || "").slice(0, 400)))
    .filter((t) => t.length >= 8);
  if (masuk.length <= n) return masuk.map((t) => t.slice(0, 280));
  const langkah = masuk.length / n;
  return Array.from({ length: n }, (_, i) => masuk[Math.floor(i * langkah)].slice(0, 280));
}

export interface InputRingkasan {
  dari: string;
  sampai: string;
  sekarang: Date;
  nama: Map<string, string>;
  laporan: EodReportRow[];
  checklist: ChecklistRow[];
  tugas: TaskRow[];
  masalah: IssueRow[];
  cekKamar: RoomCheckRow[];
  pesan: ChatMessageRow[];
  percakapan: ConversationRow[];
  sumber: RingkasanHospitality["sumber"];
}

export function susunRingkasan(i: InputRingkasan): RingkasanHospitality {
  const nm = (id: string | null) => namaDepan(id ? i.nama.get(id) : null);

  const terlewat = new Map<string, { label: string; diharapkan: number; dikirim: number }>();
  let belumLengkap = 0;
  let tanpaFo = 0;
  let keluhan = 0;
  let terlambatMaks = 0;
  for (const r of i.laporan) {
    const e = r.data?.exceptions ?? {};
    for (const m of e.missingReports ?? []) {
      const x = terlewat.get(m.kind) ?? { label: m.label || LABEL_JENIS[m.kind] || m.kind, diharapkan: 0, dikirim: 0 };
      x.diharapkan += Number(m.expected) || 0;
      x.dikirim += Number(m.submitted) || 0;
      terlewat.set(m.kind, x);
    }
    belumLengkap += e.incompleteChecklists?.length ?? 0;
    tanpaFo += e.missingVerification?.length ?? 0;
    keluhan += e.guestComplaints?.length ?? 0;
    terlambatMaks = Math.max(terlambatMaks, e.overdueItems?.length ?? 0);
  }

  const perStaf = new Map<string, { nama: string; total: number; perJenis: Record<string, number>; gagalAtauMasalah: number }>();
  for (const c of i.checklist) {
    const s = perStaf.get(c.submitted_by) ?? { nama: nm(c.submitted_by), total: 0, perJenis: {}, gagalAtauMasalah: 0 };
    s.total++;
    const j = LABEL_JENIS[c.kind] ?? c.kind;
    s.perJenis[j] = (s.perJenis[j] ?? 0) + 1;
    if (c.result === "fail" || c.result === "issue") s.gagalAtauMasalah++;
    perStaf.set(c.submitted_by, s);
  }

  const perCleaning = new Map<string, { dikirim: number; bersihUlang: number; menit: number[] }>();
  const perFo = new Map<string, { inspeksi: number; menit: number[] }>();
  for (const t of i.tugas) {
    if (t.submitted_by) {
      const c = perCleaning.get(t.submitted_by) ?? { dikirim: 0, bersihUlang: 0, menit: [] };
      c.dikirim++;
      c.bersihUlang += t.rework_count || 0;
      const m = menit(t.started_at, t.submitted_at);
      if (m !== null) c.menit.push(m);
      perCleaning.set(t.submitted_by, c);
    }
    if (t.inspected_by) {
      const f = perFo.get(t.inspected_by) ?? { inspeksi: 0, menit: [] };
      f.inspeksi++;
      const m = menit(t.submitted_at, t.inspected_at);
      if (m !== null) f.menit.push(m);
      perFo.set(t.inspected_by, f);
    }
  }

  const sekarangMs = i.sekarang.getTime();
  const balas = waktuBalas(i.pesan, i.sekarang);
  const aktif = new Set(i.pesan.map((p) => p.conversation_id));
  const percakapanAktif = i.percakapan.filter((c) => aktif.has(c.id));

  const catatan: string[] = [];
  for (const [k, v] of Object.entries(i.sumber)) if (!v.ok) catatan.push(`Sumber ${k} tidak terbaca: ${v.error ?? "galat"} — angkanya bukan nol, tapi tidak diketahui.`);
  if (i.pesan.length >= 10000) catatan.push("Chat tamu dipotong pada 10.000 pesan pertama periode ini.");
  catatan.push("Kategori AI chat & status tamu = kondisi percakapan saat ini, bukan per pesan.");

  return {
    periode: { dari: i.dari, sampai: i.sampai },
    sumber: i.sumber,
    laporanHarian: {
      hariDenganLaporan: i.laporan.length,
      laporanTerlewat: [...terlewat.values()].filter((x) => x.diharapkan > x.dikirim),
      checklistBelumLengkap: belumLengkap,
      selesaiTanpaVerifikasiFo: tanpaFo,
      keluhanTamu: keluhan,
      itemTerlambatMaks: terlambatMaks,
    },
    checklistPerStaf: [...perStaf.values()].sort((a, b) => b.total - a.total),
    tugasKamar: {
      total: i.tugas.length,
      selesai: i.tugas.filter((t) => t.status === "completed").length,
      lewatAppVillaTanpaFo: i.tugas.filter((t) => t.completion_source === "villa_app").length,
      totalBersihUlang: i.tugas.reduce((n, t) => n + (t.rework_count || 0), 0),
      perCleaning: [...perCleaning.entries()].map(([id, c]) => ({ nama: nm(id), dikirim: c.dikirim, bersihUlang: c.bersihUlang, medianMenitBersih: median(c.menit) })),
      perFo: [...perFo.entries()].map(([id, f]) => ({ nama: nm(id), inspeksi: f.inspeksi, medianMenitTungguInspeksi: median(f.menit) })),
    },
    masalah: {
      total: i.masalah.length,
      terbuka: i.masalah.filter((m) => m.status === "open" || m.status === "in_progress").length,
      terlambat: i.masalah.filter((m) => !m.resolved_at && m.target_at && Date.parse(m.target_at) < sekarangMs).length,
      tanpaPenanggungJawab: i.masalah.filter((m) => !m.assigned_to && m.status !== "resolved" && m.status !== "cancelled").length,
      perKategori: hitung(i.masalah, (m) => `${m.category}/${m.severity}`),
    },
    pengecekanKamarVilla: {
      total: i.cekKamar.length,
      perHasil: hitung(i.cekKamar, (c) => c.hasil),
      perPengecek: hitung(i.cekKamar, (c) => namaDepan(c.dicek_oleh_nama)),
    },
    chatTamu: {
      percakapanAktif: aktif.size,
      pesanMasuk: i.pesan.filter((p) => p.arah === "masuk").length,
      balasanStaf: i.pesan.filter((p) => p.arah === "keluar" && !p.is_perintah_otomatis).length,
      balasanOtomatis: i.pesan.filter((p) => p.arah === "keluar" && p.is_perintah_otomatis).length,
      medianMenitBalas: median(balas.menit),
      p90MenitBalas: persentil(balas.menit, 0.9),
      tidakDibalas2Jam: balas.tidakDibalas2Jam,
      perStatusTamu: hitung(percakapanAktif, (c) => c.status_tamu ?? "tidak diketahui"),
      perKategoriAi: hitung(percakapanAktif, (c) => c.ai_kategori ?? "belum dikategorikan"),
      contohPesanTamu: contohPesan(i.pesan),
    },
    catatan,
  };
}

async function ambil<T>(
  sumber: RingkasanHospitality["sumber"],
  nama: string,
  q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
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

/** Baca semua sumber (service role, hanya SELECT) lalu susun ringkasan. */
export async function ringkasanHospitality(admin: SupabaseClient, dari: string, sampai: string, sekarang = new Date()): Promise<RingkasanHospitality> {
  const sumber: RingkasanHospitality["sumber"] = {};
  const dariTs = `${dari}T00:00:00+07:00`;
  const sampaiTs = `${sampai}T23:59:59+07:00`;

  const [laporan, checklist, tugas, masalah, cekKamar] = await Promise.all([
    ambil<EodReportRow>(sumber, "laporan_harian", admin.from("mkc_hosp_reports").select("report_date, data").eq("period_kind", "end_of_day").eq("status", "success").gte("report_date", dari).lte("report_date", sampai)),
    ambil<ChecklistRow>(sumber, "checklist_staf", admin.from("mkc_hosp_checklists").select("kind, result, submitted_by, report_date").gte("report_date", dari).lte("report_date", sampai).limit(5000)),
    ambil<TaskRow>(sumber, "tugas_kamar", admin.from("mkc_hosp_room_tasks").select("status, completion_source, rework_count, submitted_by, inspected_by, started_at, submitted_at, inspected_at").gte("created_at", dariTs).lte("created_at", sampaiTs).limit(5000)),
    ambil<IssueRow>(sumber, "masalah", admin.from("mkc_hosp_issues").select("category, severity, status, assigned_to, target_at, resolved_at").gte("created_at", dariTs).lte("created_at", sampaiTs).limit(2000)),
    ambil<RoomCheckRow>(sumber, "cek_kamar_villa", admin.from("villa_room_checks").select("hasil, dicek_oleh_nama, property_kode").gte("created_at", dariTs).lte("created_at", sampaiTs).limit(5000)),
  ]);

  const pesan: ChatMessageRow[] = [];
  for (let hal = 0; hal < 10; hal++) {
    const potong = await ambil<ChatMessageRow>(
      sumber,
      "chat_tamu",
      admin
        .from("wa_conversation_messages")
        .select("conversation_id, arah, isi, terjemahan, is_perintah_otomatis, created_at")
        .gte("created_at", dariTs)
        .lte("created_at", sampaiTs)
        .order("created_at", { ascending: true })
        .range(hal * 1000, hal * 1000 + 999),
    );
    pesan.push(...potong);
    if (potong.length < 1000) break;
  }
  if (sumber.chat_tamu?.ok) sumber.chat_tamu.baris = pesan.length;

  const idPercakapan = [...new Set(pesan.map((p) => p.conversation_id))];
  const percakapan: ConversationRow[] = [];
  for (let i = 0; i < idPercakapan.length; i += 300) {
    percakapan.push(
      ...(await ambil<ConversationRow>(sumber, "percakapan", admin.from("wa_conversations").select("id, status_tamu, ai_kategori, property_kode").in("id", idPercakapan.slice(i, i + 300)))),
    );
  }

  const idStaf = [
    ...new Set([...checklist.map((c) => c.submitted_by), ...tugas.flatMap((t) => [t.submitted_by, t.inspected_by]), ...masalah.map((m) => m.assigned_to)].filter((x): x is string => Boolean(x))),
  ];
  const staf = idStaf.length ? await ambil<{ id: string; full_name: string | null }>(sumber, "karyawan", admin.from("employees").select("id, full_name").in("id", idStaf)) : [];
  const nama = new Map(staf.map((s) => [s.id, s.full_name ?? ""]));

  return susunRingkasan({ dari, sampai, sekarang, nama, laporan, checklist, tugas, masalah, cekKamar, pesan, percakapan, sumber });
}
