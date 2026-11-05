import "server-only";

import { generateAIText } from "@/lib/ai/service";

const SYSTEM_PROMPT =
  "Kamu adalah asisten AI yang membaca foto, screenshot, atau PDF mutasi rekening bank perusahaan untuk membantu bagian keuangan mencocokkan dana masuk. Salin HANYA apa yang benar-benar tertulis di dokumen -- jangan mengarang baris, tanggal, keterangan, atau nominal, dan jangan menjumlahkan atau membulatkan angka. Kalau dokumen tidak terbaca atau bukan mutasi rekening, katakan begitu. Balas HANYA dengan JSON object valid, tanpa markdown code fence.";

export interface MutasiBaris {
  /** YYYY-MM-DD */
  tanggal: string;
  keterangan: string;
  /** Rupiah, bilangan bulat positif. */
  nominal: number;
  arah: "masuk" | "keluar";
}

export interface MutasiBankHasil {
  readable: boolean;
  bank: string | null;
  rows: MutasiBaris[];
  catatan: string;
}

const MAKS_BARIS = 300;

function parseBaris(value: unknown): MutasiBaris[] {
  if (!Array.isArray(value)) return [];
  const rows: MutasiBaris[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const tanggal = typeof r.tanggal === "string" ? r.tanggal.trim() : "";
    const nominal = typeof r.nominal === "number" ? r.nominal : Number(r.nominal);
    const arah = r.arah === "masuk" || r.arah === "keluar" ? r.arah : null;
    // Baris yang tanggal/nominal/arahnya tidak jelas dibuang, bukan ditebak:
    // angka yang salah baca lebih berbahaya daripada baris yang hilang,
    // karena baris yang hilang masih terlihat oleh finance di dokumen aslinya.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || !arah || !Number.isFinite(nominal) || nominal <= 0) continue;
    rows.push({
      tanggal,
      keterangan: typeof r.keterangan === "string" ? r.keterangan.replace(/\s+/g, " ").trim().slice(0, 300) : "",
      nominal: Math.round(nominal),
      arah,
    });
    if (rows.length >= MAKS_BARIS) break;
  }
  return rows;
}

export function parseMutasiReply(text: string): MutasiBankHasil {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI bukan JSON yang valid");
  }

  return {
    readable: parsed.readable === true,
    bank: typeof parsed.bank === "string" && parsed.bank.trim() ? parsed.bank.trim().slice(0, 60) : null,
    rows: parseBaris(parsed.rows),
    catatan: typeof parsed.catatan === "string" ? parsed.catatan.trim().slice(0, 300) : "",
  };
}

/**
 * Villa's Checklist Dana Masuk bridge (see app/api/villa/ai/bank-statement).
 * Reads one bank-statement photo/screenshot/PDF and transcribes its rows --
 * date, description, amount, credit/debit. Transcription only: matching a
 * transfer to OTA payouts and recording anything as received stays in
 * villa's own code and is confirmed by a finance user, so the model never
 * decides what counts as paid.
 */
export async function bacaMutasiBank(input: { data: string; mimeType: string; hariIni: string }): Promise<MutasiBankHasil> {
  const userPrompt = `Ini adalah mutasi rekening bank (foto, screenshot aplikasi bank, atau PDF rekening koran). Hari ini ${input.hariIni}.

Salin SETIAP baris transaksi yang terlihat:
- tanggal: tanggal transaksi, format YYYY-MM-DD. Kalau tahun tidak tertulis, pakai tahun yang paling masuk akal dari hari ini (bukan tanggal di masa depan).
- keterangan: teks keterangan/uraian/nama pengirim persis seperti tertulis (gabungkan kalau terpecah beberapa baris).
- nominal: jumlah transaksi dalam rupiah sebagai angka bulat tanpa titik/koma pemisah ribuan (mis. "8.954.169,00" -> 8954169). Jangan pakai kolom saldo.
- arah: "masuk" untuk kredit/CR/uang masuk/tanda +, "keluar" untuk debit/DB/uang keluar/tanda -.

Lewati baris saldo awal, saldo akhir, dan total. Jangan menebak baris yang terpotong atau tidak terbaca -- sebutkan saja di catatan.

Balas HANYA dengan JSON object:
{"readable": true, "bank": "Mandiri", "rows": [{"tanggal": "2026-10-29", "keterangan": "...", "nominal": 8954169, "arah": "masuk"}], "catatan": ""}

Kalau ini bukan mutasi rekening atau tidak terbaca: {"readable": false, "bank": null, "rows": [], "catatan": "alasannya"}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.data, mimeType: input.mimeType },
    responseFormat: "json",
    temperature: 0,
    maxOutputTokens: 8192,
  });
  return parseMutasiReply(response.text);
}

// ── Daftar payout OTA (owner 2026-11-06) ────────────────────────────────
// Finance mengunggah foto/screenshot daftar payout Booking.com atau Agoda
// (sebelum transfer masuk). Sama seperti mutasi bank: hanya menyalin. Villa
// yang mencocokkan ke booking dan finance yang menekan tombol pencatatan.

export interface PayoutBarisHasil {
  /** Nomor booking/reservasi OTA persis seperti tertulis (string, bukan angka). */
  nomor: string;
  tipe: string;
  tamu: string;
  /** YYYY-MM-DD, atau "" kalau tidak tertulis. */
  checkin: string;
  checkout: string;
  /** Rupiah bulat; null kalau tidak ada kolomnya. */
  kotor: number | null;
  /** Yang dibayarkan ke properti untuk booking ini (Net / Payout). */
  net: number;
}

export interface PayoutListHasil {
  readable: boolean;
  ota: "booking.com" | "agoda" | null;
  rows: PayoutBarisHasil[];
  /** Total payout yang tertulis di dokumen, untuk dicek terhadap jumlah baris; null kalau tidak ada. */
  total: number | null;
  catatan: string;
}

const MAKS_BARIS_PAYOUT = 300;

function angka(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

export function parsePayoutReply(text: string): PayoutListHasil {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Respons AI bukan JSON yang valid");
  }
  const rows: PayoutBarisHasil[] = [];
  if (Array.isArray(parsed.rows)) {
    for (const raw of parsed.rows) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const nomor = typeof r.nomor === "string" || typeof r.nomor === "number" ? String(r.nomor).replace(/\s+/g, "") : "";
      const net = angka(r.net);
      // Baris tanpa nomor atau Net yang jelas dibuang, bukan ditebak.
      if (!nomor || net == null) continue;
      const tgl = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : "");
      rows.push({
        nomor,
        tipe: typeof r.tipe === "string" ? r.tipe.trim().slice(0, 40) : "Reservation",
        tamu: typeof r.tamu === "string" ? r.tamu.replace(/\s+/g, " ").trim().slice(0, 120) : "",
        checkin: tgl(r.checkin),
        checkout: tgl(r.checkout),
        kotor: r.kotor == null ? null : angka(r.kotor),
        net,
      });
      if (rows.length >= MAKS_BARIS_PAYOUT) break;
    }
  }
  const ota = parsed.ota === "booking.com" || parsed.ota === "agoda" ? parsed.ota : null;
  return {
    readable: parsed.readable === true,
    ota,
    rows,
    total: parsed.total == null ? null : angka(parsed.total),
    catatan: typeof parsed.catatan === "string" ? parsed.catatan.trim().slice(0, 300) : "",
  };
}

export async function bacaDaftarPayout(input: { data: string; mimeType: string; hariIni: string }): Promise<PayoutListHasil> {
  const userPrompt = `Ini adalah daftar payout dari OTA (Booking.com atau Agoda): foto, screenshot, atau PDF. Hari ini ${input.hariIni}.

Salin SETIAP baris booking yang terlihat:
- nomor: nomor booking/reservasi OTA persis seperti tertulis (Booking.com: "Booking number", 10 digit; Agoda: nomor kecil di bawah nama tamu). Tulis sebagai string, jangan diubah.
- tipe: "Reservation" kalau tertulis atau tidak ada kolom tipe; kalau tertulis lain (Adjustment, Refund, dst) salin apa adanya.
- tamu: nama tamu persis seperti tertulis (boleh terpotong seperti di layar).
- checkin, checkout: format YYYY-MM-DD. Agoda menulis "Stay dates" sebagai "tanggal masuk - tanggal keluar"; pisahkan jadi checkin dan checkout.
- kotor: kolom "Amount" (sebelum komisi) kalau ada, kalau tidak ada null.
- net: jumlah yang DIBAYARKAN ke properti untuk booking itu (Booking.com: kolom "Net"; Agoda: kolom "Payout"), rupiah bulat tanpa pemisah ribuan/desimal (mis. "389.697,00" -> 389697, "Rp 1,105,912" -> 1105912). Jangan pakai kolom Commission, VAT, atau Fee.
- total: total payout yang tertulis di dokumen kalau ada (mis. "Total payout IDR 1.219.504,00" -> 1219504), kalau tidak ada null. JANGAN menjumlahkan sendiri.

Jangan menebak baris yang terpotong atau tidak terbaca -- sebutkan di catatan.

Balas HANYA dengan JSON object:
{"readable": true, "ota": "booking.com", "rows": [{"nomor": "6953881895", "tipe": "Reservation", "tamu": "Lawrence Efraim", "checkin": "2026-10-31", "checkout": "2026-11-02", "kotor": 1410150, "net": 1105912}], "total": 5921531, "catatan": ""}

"ota" hanya "booking.com", "agoda", atau null. Kalau ini bukan daftar payout atau tidak terbaca: {"readable": false, "ota": null, "rows": [], "total": null, "catatan": "alasannya"}`;

  const response = await generateAIText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    image: { data: input.data, mimeType: input.mimeType },
    responseFormat: "json",
    temperature: 0,
    maxOutputTokens: 8192,
  });
  return parsePayoutReply(response.text);
}
