import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeConstructionCostRequest, type CostRequestRecognition } from "@/lib/ai/domains/loonars-coffee-recognition";
import { recognizeExpenseReceipt, type ExpenseReceiptRecognition } from "@/lib/ai/domains/expense-receipt-recognition";
import { recognizeBahanPesanan, type BahanRecognition } from "@/lib/ai/domains/loonars2-bahan-recognition";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";

/**
 * Keuangan Loonars 2 lewat WhatsApp (owner 2026-10-11) -- ADAPTOR tipis.
 *
 * Semua data, hitungan uang (alokasi C -> B -> D, saldo, syarat profit),
 * whitelist nomor per peran, konfirmasi "YA", audit log, dan teks balasan
 * tinggal di MKH Property (mkh-properti migrasi 0043, RPC loonars2_wa).
 * File ini hanya: (1) mengenali perintah dari teks/keterangan foto,
 * (2) memakai Gemini yang sudah ada untuk membaca rincian pengajuan
 * material Vando (teks bebas atau foto nota -- sama seperti Loonars Coffee),
 * (3) meneruskannya ke https://finance.haluoleo.id/api/loonars2/wa dengan
 * rahasia sync yang SUDAH ADA (get_sync_secret -> Vault mk_sync_shared_secret,
 * sama dengan "lapkeu"), dan (4) mengirim pesan keluar yang diantrekan MKH
 * Property (pengingat, laporan, perintah transfer dari web).
 *
 * Gemini tidak pernah menghitung uang. Perintah owner yang mengubah uang
 * dikenali dengan pola tetap (regex), bukan AI.
 *
 * Bentrok perintah: "setujui/tolak" Loonars 2 memakai kode L2-<n> atau #<n>
 * (Coffee memakai 6+ hex, promo villa tepat 6 hex); pesan pelaksana diawali
 * "L2"/"Loonars 2". Nomor yang tidak terdaftar di loonars2_wa_users
 * mendapat status "abaikan" dari MKH Property dan pesannya diteruskan ke
 * alur lain seperti biasa.
 */

const MKH_PROPERTY_LOONARS2_URL = "https://finance.haluoleo.id/api/loonars2/wa";

export type Loonars2Aksi =
  | "saldo"
  | "tagihan"
  | "receipt"
  | "konfirmasi_transfer"
  | "ubah_rekening"
  | "putuskan"
  | "cairkan_profit"
  | "ajukan"
  | "bayar_pengajuan"
  | "utang"
  | "daftar_utang"
  | "ajukan_mingguan"
  | "putuskan_kode"
  | "bayar_kelompok"
  | "unit_dibangun"
  | "borongan"
  | "daftar_borongan"
  | "koreksi_bahan"
  | "rab"
  | "ya"
  | "batal";

export type Loonars2Perintah =
  | { aksi: Loonars2Aksi; data: Record<string, unknown> }
  /** Pengajuan material/tukang pelaksana -- rinciannya dibaca Gemini. */
  | { aksi: "ajukan_ai"; unit: string | null; teks: string }
  /** Pembelian secara utang di toko (keterangan foto nota juga boleh). */
  | { aksi: "utang_foto"; unit: string[]; toko: string | null; deskripsi: string; nominal: number | null; teks?: string }
  /** Pesanan bahan kolektif (tanpa menyebut unit) -- rincian & pembagian per item dibaca Gemini. */
  | { aksi: "bahan_ai"; teks: string; utang: boolean; unit: string[] }
  /** Diawali "L2" tapi tidak dikenali -- dibalas daftar perintah. */
  | { aksi: "bantuan" };

// ---------------------------------------------------------------------------
// Pengenalan perintah (murni, tanpa jaringan -- diuji di
// tests/unit/lib/loonars2-wa.test.ts)
// ---------------------------------------------------------------------------

/**
 * "210 juta", "73,8 jt", "1.850.000", "350rb", "1,2 M", "Rp 210.000.000" -> rupiah bulat; null kalau tidak ada.
 * Bila ada beberapa angka ("semen 20 sak 1.300.000") diambil yang terbesar;
 * angka polos di bawah Rp 1.000 (jumlah sak, rit, unit) diabaikan. "M" tanpa
 * kata "miliar" hanya dibaca miliar di akhir teks ("1 M"), supaya "10 m kabel"
 * tidak terbaca 10 miliar.
 */
export function parseRupiah(teks: string): number | null {
  const t = teks.toLowerCase().replace(/rp\.?/g, " ");
  const kandidat: number[] = [];
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*(miliar|milyar|juta|jt|ribu|rb|k)\b/g)) {
    const angka = Number.parseFloat(m[1].replace(",", "."));
    const kali = m[2].startsWith("mi") ? 1e9 : m[2] === "juta" || m[2] === "jt" ? 1e6 : 1e3;
    kandidat.push(Math.round(angka * kali));
  }
  const miliarAkhir = t.match(/(\d+(?:[.,]\d+)?)\s*m\s*[.,-]*\s*$/);
  if (miliarAkhir) kandidat.push(Math.round(Number.parseFloat(miliarAkhir[1].replace(",", ".")) * 1e9));
  if (kandidat.length === 0) {
    for (const m of t.matchAll(/\d{1,3}(?:[.,]\d{3})+(?!\d)|\d+/g)) {
      const n = Number.parseInt(m[0].replace(/[.,]/g, ""), 10);
      if (n >= 1000) kandidat.push(n);
    }
  }
  const terbesar = kandidat.length > 0 ? Math.max(...kandidat) : 0;
  return terbesar > 0 ? terbesar : null;
}

const UNIT_RE = /\b(?:unit\s*(\d{1,2})|(avara|banyu|lunara)[\s-]?(\d{1,2}))\b/i;

/** "unit 5" -> "5", "BANYU 6"/"banyu-06" -> "BANYU-06". */
export function parseUnit(teks: string): { ref: string; sisa: string } | null {
  const m = teks.match(UNIT_RE);
  if (!m) return null;
  const ref = m[1] ? m[1] : `${m[2].toUpperCase()}-${m[3].padStart(2, "0")}`;
  return { ref, sisa: (teks.slice(0, m.index) + " " + teks.slice((m.index ?? 0) + m[0].length)).trim() };
}

const RENTANG = String.raw`(?:-|–|s\/d|sd|sampai|hingga)`;
const NOMOR_UNIT = String.raw`\d{1,2}(?:\s*${RENTANG}\s*\d{1,2})?`;
const DAFTAR_UNIT = String.raw`${NOMOR_UNIT}(?:\s*(?:,|dan|&|\+|\/)\s*${NOMOR_UNIT})*`;

/** "1-6" -> [1..6], "5" -> [5], "1-3,5" -> [1,2,3,5]; rentang dibatasi 1..99 dan maksimal 30 unit. */
function perluasNomor(daftar: string): number[] {
  const hasil: number[] = [];
  for (const bagian of daftar.split(/\s*(?:,|dan|&|\+|\/)\s*/i)) {
    const r = bagian.match(new RegExp(String.raw`^(\d{1,2})\s*${RENTANG}\s*(\d{1,2})$`, "i"));
    if (r) {
      const dari = Number(r[1]);
      const sampai = Number(r[2]);
      if (dari >= 1 && sampai >= dari && sampai - dari < 30) for (let n = dari; n <= sampai; n++) hasil.push(n);
    } else if (/^\d{1,2}$/.test(bagian.trim())) {
      hasil.push(Number(bagian));
    }
  }
  return hasil;
}

/** Semua unit dalam teks: "unit 5,6 dan 7", "unit 1-6", "BANYU-06 & LUNARA-1" -> nomor / kode (tanpa duplikat). */
export function parseUnits(teks: string): string[] {
  const hasil: string[] = [];
  for (const m of teks.matchAll(new RegExp(String.raw`\b(?:unit|blok)\s*(${DAFTAR_UNIT})`, "gi"))) {
    for (const n of perluasNomor(m[1])) hasil.push(String(n));
  }
  for (const m of teks.matchAll(/\b(avara|banyu|lunara)[\s-]?(\d{1,2})\b/gi)) {
    hasil.push(`${m[1].toUpperCase()}-${m[2].padStart(2, "0")}`);
  }
  return [...new Set(hasil)];
}

const UNIT_SEMUA_RE = new RegExp(String.raw`\b(?:unit|blok)\s*${DAFTAR_UNIT}|\b(?:avara|banyu|lunara)[\s-]?\d{1,2}\b`, "gi");
const UANG_RE = /(?:rp\.?\s*)?\d[\d.,]*\s*(?:miliar|milyar|juta|jt|ribu|rb|k)\b|(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?!\d)|rp\.?\s*\d+/gi;

/** Teks tanpa sebutan unit dan nominal uang (untuk nama toko / rincian). */
function bersihkan(teks: string): string {
  return teks.replace(UNIT_SEMUA_RE, " ").replace(UANG_RE, " ").replace(/\s+/g, " ").replace(/^[\s,:;-]+|[\s,:;-]+$/g, "").trim();
}

export type BarisMingguan = { jenis: "cicilan" | "tukang" | "material" | "lain" | "retensi"; toko?: string; unit?: string[]; deskripsi: string; nominal: number | null };

/** Biaya operasional di luar bahan bangunan & upah tukang: dibagi rata ke unit yang sedang dibangun bila unit tidak disebut. */
const BIAYA_LAIN_RE = /^(?:lain(?:-lain)?|biaya\s+lain)\b|\b(?:listrik|air\s+(?:bersih|pdam|bor)|bensin|solar|bbm|konsumsi|makan|minum|transport|ongkir|ongkos|sewa|asuransi|satpam|keamanan|kebersihan|perizinan|izin)\b/i;

/** Satu baris pengajuan mingguan: cicilan toko, kontraktor/tukang, atau material/lain. */
export function parseBarisMingguan(baris: string): BarisMingguan | null {
  const teks = baris.replace(/^\s*(?:[-•*]|\d{1,2}[.)])\s*/, "").replace(/\s+/g, " ").trim();
  if (!teks) return null;
  const nominal = parseRupiah(teks.replace(UNIT_SEMUA_RE, " "));
  const cicilan = teks.match(/^(?:cicilan|cicil|angsuran|bayar\s+utang)\s+(?:utang\s+)?(?:ke\s+)?(.+)$/i);
  if (cicilan) {
    return { jenis: "cicilan", toko: bersihkan(cicilan[1]).replace(/\s+(?:lunas|semua|penuh|habis|sisanya?)$/i, ""), deskripsi: teks, nominal };
  }
  const jenis = /\bretensi\b/i.test(teks)
    ? "retensi"
    : /\b(kontraktor|tukang|upah|borongan|mandor)\b/i.test(teks)
    ? "tukang"
    : BIAYA_LAIN_RE.test(teks)
      ? "lain"
      : "material";
  const toko = teks.match(/\b((?:tb|toko|ud|cv)\s+[a-z0-9][\w .&-]*)$/i);
  return { jenis, unit: parseUnits(teks), deskripsi: bersihkan(teks), toko: toko ? toko[1].trim() : undefined, nominal };
}

const PREFIX_RE = /^(?:l2|loonars\s*2)\b[\s:,.-]*/i;

/**
 * Pengajuan mingguan berbaris-baris (dibaca SEBELUM spasi/baris diratakan):
 *   L2 pengajuan minggu ini
 *   - cicilan TB Maju 3 juta
 *   - kontraktor Pak Anang unit 5,6 15 juta
 * Satu baris juga boleh: "L2 cicilan TB Maju 3 juta", "L2 tukang minggu ini" (upah borongan, nominal dihitung sistem),
 * "L2 retensi unit 3", "L2 kontraktor Pak Anang unit 5 7,5 juta".
 */
export function parsePengajuanMingguan(input: string): Loonars2Perintah | null {
  const baris = input.split(/\r?\n/).map((b) => b.trim()).filter(Boolean);
  if (baris.length === 0) return null;
  const awalan = baris[0].match(PREFIX_RE);
  if (!awalan) return null;
  const kepala = baris[0].slice(awalan[0].length).trim();
  const header = kepala.match(/^(?:pengajuan|ajuan|mingguan)\b(?:\s+(?:pembayaran|bayar|biaya))?(?:\s+minggu\s+ini|\s+mingguan)?[\s:,-]*(.*)$/i);
  let isi: string[];
  if (header) {
    isi = [header[1], ...baris.slice(1)].filter((b) => b.trim());
  } else if (baris.length === 1 && /^(?:(?:cicilan|cicil|angsuran|bayar\s+utang|kontraktor|tukang|upah|mandor|retensi)\b|borongan\s+\S)/i.test(kepala) || /^(?:lain(?:-lain)?|biaya\s+lain|listrik|bensin|solar|bbm|konsumsi|transport|ongkir|sewa|asuransi|satpam|kebersihan)\b/i.test(kepala)) {
    isi = [kepala];
  } else {
    return null;
  }
  const hasil = isi.map(parseBarisMingguan).filter((b): b is BarisMingguan => b !== null);
  if (hasil.length === 0) return { aksi: "bantuan" };
  return { aksi: "ajukan_mingguan", data: { baris: hasil } };
}

function parseAtasNama(teks: string): string | null {
  const m = teks.match(/\b(?:a\.?\s?n\.?|atas\s+nama)\s+(.+)$/i);
  return m ? m[1].trim().replace(/[.,]$/, "") : null;
}

/**
 * "L2 borongan" -> daftar borongan. "L2 borongan Pak Anang unit 1-6 35 juta retensi 9 juta 12 minggu" -> owner mencatat
 * borongan baru (wajib ada jumlah minggu dan nominal; selain itu null supaya "L2 borongan Pak Anang minggu ini"
 * tetap dibaca sebagai baris pengajuan mingguan).
 */
export function parseBorongan(input: string): Loonars2Perintah | null {
  const asli = input.trim().replace(/\s+/g, " ");
  const awalan = asli.match(PREFIX_RE);
  if (!awalan) return null;
  const m = asli.slice(awalan[0].length).match(/^borongan\b\s*(.*)$/i);
  if (!m) return null;
  const rincian = m[1];
  if (rincian.trim() === "") return { aksi: "daftar_borongan", data: {} };
  const minggu = rincian.match(/(\d{1,3})\s*(?:minggu|mgg|pekan)\b/i);
  const units = parseUnits(rincian);
  const tanpaMinggu = (t: string) => t.replace(/(\d{1,3})\s*(?:minggu|mgg|pekan)\b/gi, " ");
  const [kiri, kanan = ""] = rincian.split(/\bretensi\b/i);
  const nilai = parseRupiah(tanpaMinggu(kiri).replace(UNIT_SEMUA_RE, " "));
  if (!minggu || !nilai) return null;
  const posUnit = kiri.search(UNIT_SEMUA_RE);
  UNIT_SEMUA_RE.lastIndex = 0;
  const nama = bersihkan(tanpaMinggu(posUnit >= 0 ? kiri.slice(0, posUnit) : kiri));
  return {
    aksi: "borongan",
    data: { nama: nama || null, unit: units, nilai, retensi: kanan ? parseRupiah(tanpaMinggu(kanan)) ?? 0 : 0, minggu: Number(minggu[1]) },
  };
}

export function parseLoonars2Perintah(input: string): Loonars2Perintah | null {
  const borongan = parseBorongan(input);
  if (borongan) return borongan;
  const mingguan = parsePengajuanMingguan(input);
  if (mingguan) return mingguan;
  const asli = input.trim().replace(/\s+/g, " ");
  if (!asli) return null;
  const awalan = asli.match(PREFIX_RE);
  const teks = awalan ? asli.slice(awalan[0].length).trim() : asli;
  const kecil = teks.toLowerCase();

  // Jawaban konfirmasi -- hanya diproses bila MKH Property memang sedang
  // menunggu YA dari nomor ini (selain itu "tidak_ada_pending" -> lewat).
  if (/^(ya|iya)$/.test(kecil)) return { aksi: "ya", data: {} };
  if (/^batal$/.test(kecil)) return { aksi: "batal", data: {} };

  if (/^saldo$/.test(kecil)) return { aksi: "saldo", data: {} };
  if (/^tagihan$/.test(kecil)) return { aksi: "tagihan", data: {} };
  if (/^(?:daftar\s+|sisa\s+)?utang(?:\s+toko)?$/.test(kecil) && (awalan || /^utang$/.test(kecil))) {
    return { aksi: "daftar_utang", data: {} };
  }

  // "sudah 1" / "sudah semua" / "sudah T15"
  const sudah = kecil.match(/^sudah\s+(semua|\d|t\d+)$/);
  if (sudah) return { aksi: "konfirmasi_transfer", data: { ref: sudah[1] } };
  // "sudah transfer B 73,8 juta"
  const sudahRek = kecil.match(/^sudah\s+(?:transfer|tf|trf)\s+(?:ke\s+)?(?:rek(?:ening)?\s+)?([bcd])\s+(.+)$/);
  if (sudahRek) {
    const nominal = parseRupiah(sudahRek[2]);
    if (nominal) return { aksi: "konfirmasi_transfer", data: { rekening: sudahRek[1].toUpperCase(), nominal } };
  }

  // "DP unit 5, 210 juta a.n. Budi" / "pelunasan unit 5" / "booking BANYU-06 5jt"
  const bayar = teks.match(/^(dp|pelunasan|booking|cicilan)\b[\s:,]*(.*)$/i);
  if (bayar) {
    const unit = parseUnit(bayar[2]);
    if (unit) {
      const atasNama = parseAtasNama(unit.sisa);
      const tanpaNama = atasNama ? unit.sisa.replace(/\b(?:a\.?\s?n\.?|atas\s+nama)\s+.+$/i, "") : unit.sisa;
      const data: Record<string, unknown> = { unit: unit.ref, jenis: bayar[1].toLowerCase() };
      const nominal = parseRupiah(tanpaNama);
      if (nominal) data.nominal = nominal;
      if (atasNama) data.nama_pembeli = atasNama;
      return { aksi: "receipt", data };
    }
  }

  // "setujui M-3" (pengajuan mingguan) / "setujui U-2 buffer" (utang) / "tolak C-5 <alasan>" (cicilan)
  const putusKode = teks.match(/^(setujui|setuju|acc|tolak)\s+([muc])\s*-\s*(\d+)\b\s*(.*)$/i);
  if (putusKode) {
    const setuju = putusKode[1].toLowerCase() !== "tolak";
    const kode = `${putusKode[2].toUpperCase()}-${putusKode[3]}`;
    const sisa = putusKode[4].trim();
    return {
      aksi: "putuskan_kode",
      data: setuju ? { kode, setuju: true, buffer: /\bbuffer\b/i.test(sisa) } : { kode, setuju: false, alasan: sisa.replace(/^alasan[:\s]*/i, "") || null },
    };
  }

  // "setujui L2-12" / "setujui #12 buffer" / "tolak L2-12 alasan harga kemahalan"
  const putus = teks.match(/^(setujui|setuju|acc|tolak)\s+(?:l2-?|#)\s*(\d+)\b\s*(.*)$/i);
  if (putus) {
    const setuju = putus[1].toLowerCase() !== "tolak";
    const sisa = putus[3].trim();
    return {
      aksi: "putuskan",
      data: setuju
        ? { id: Number(putus[2]), setuju: true, buffer: /\bbuffer\b/i.test(sisa) }
        : { id: Number(putus[2]), setuju: false, alasan: sisa.replace(/^alasan[:\s]*/i, "") || null },
    };
  }

  // "ubah rekening C BCA 1234567890 a.n. PT MKH"
  const rek = teks.match(/^ubah\s+rek(?:ening)?\s+([abcd])\s+(.+)$/i);
  if (rek) {
    const nama = parseAtasNama(rek[2]);
    const tanpaNama = rek[2].replace(/\b(?:a\.?\s?n\.?|atas\s+nama)\s+.+$/i, "").trim();
    const nomor = tanpaNama.match(/\d[\d\s-]{3,}\d/);
    const bank = nomor ? tanpaNama.slice(0, nomor.index).trim() : tanpaNama;
    return {
      aksi: "ubah_rekening",
      data: { rekening: rek[1].toUpperCase(), bank: bank || null, nomor: nomor ? nomor[0].replace(/\D/g, "") : null, nama },
    };
  }

  // "cairkan profit 200 juta"
  const profit = kecil.match(/^cairkan\s+profit\s+(.+)$/);
  if (profit) return { aksi: "cairkan_profit", data: { nominal: parseRupiah(profit[1]) } };

  // Sisanya hanya untuk pesan berawalan "L2" (pelaksana).
  if (!awalan) return null;

  // "L2 bayar M-3" -- bayar semua baris pengajuan mingguan yang disetujui
  const bayarKelompok = teks.match(/^(?:bayar|dibayar|lunas)\s+m\s*-\s*(\d+)\b/i);
  if (bayarKelompok) return { aksi: "bayar_kelompok", data: { kode: `M-${bayarKelompok[1]}` } };

  // "L2 unit 1-6" -- jawaban pertanyaan "unit mana yang sedang dibangun?" (hanya nomor unit)
  const hanyaUnit = parseUnits(teks);
  if (/^(?:unit|blok)\b/i.test(teks) && hanyaUnit.length > 0 && !/[a-z0-9]/i.test(teks.replace(UNIT_SEMUA_RE, " ").replace(/\b(?:unit|blok|dan|sama|sedang|dibangun)\b/gi, " "))) {
    return { aksi: "unit_dibangun", data: { unit: hanyaUnit } };
  }

  // "L2 rab" / "L2 rab unit 3" -- RAB pemakaian bahan per unit
  const rab = teks.match(/^rab\b\s*(.*)$/i);
  if (rab) {
    const u = parseUnits(rab[1]);
    return { aksi: "rab", data: u.length > 0 ? { unit: u[0] } : {} };
  }

  // "L2 koreksi M-7 semen unit 1,2,3" -- pindahkan pembagian bahan
  const koreksi = teks.match(/^koreksi\s+([mu])\s*-\s*(\d+)\b\s*(.*)$/i);
  if (koreksi) {
    const units = parseUnits(koreksi[3]);
    const item = bersihkan(koreksi[3].replace(/\b(?:bahan|ke|untuk|pindah(?:kan)?)\b/gi, " "));
    return { aksi: "koreksi_bahan", data: { kode: `${koreksi[1].toUpperCase()}-${koreksi[2]}`, item: item || null, unit: units } };
  }

  // "L2 bahan TB Maju semen 100 sak, pasir 12 rit 8,5 juta" / "L2 bahan utang TB Maju ..." -- pesanan kolektif
  const bahan = teks.match(/^bahan\s+(?:(utang|hutang|ngutang)\s+)?(.+)$/i);
  if (bahan) return { aksi: "bahan_ai", teks: bahan[2], utang: Boolean(bahan[1]), unit: parseUnits(bahan[2]) };

  // "L2 utang TB Maju unit 5 semen 50 sak 6.500.000"
  const utang = teks.match(/^utang\s+(.+)$/i);
  if (utang) {
    const units = parseUnits(utang[1]);
    const posUnit = utang[1].search(UNIT_SEMUA_RE);
    UNIT_SEMUA_RE.lastIndex = 0;
    const toko = posUnit > 0 ? bersihkan(utang[1].slice(0, posUnit)) : null;
    const setelah = posUnit >= 0 ? utang[1].slice(posUnit) : utang[1];
    return {
      aksi: "utang_foto",
      unit: units,
      toko: toko || null,
      deskripsi: bersihkan(setelah),
      nominal: parseRupiah(setelah.replace(UNIT_SEMUA_RE, " ")),
      teks: utang[1],
    };
  }

  // "L2 bayar L2-12" (biasanya keterangan foto bukti transfer)
  const bayarPengajuan = teks.match(/^(?:bayar|dibayar|lunas)\s+(?:l2-?|#)\s*(\d+)\b\s*(.*)$/i);
  if (bayarPengajuan) {
    const data: Record<string, unknown> = { id: Number(bayarPengajuan[1]) };
    const nominal = parseRupiah(bayarPengajuan[2]);
    if (nominal) data.nominal = nominal;
    return { aksi: "bayar_pengajuan", data };
  }

  const unit = parseUnit(teks);
  if (unit) return { aksi: "ajukan_ai", unit: unit.ref, teks };
  return { aksi: "bantuan" };
}

export const LOONARS2_BANTUAN =
  "Perintah Loonars 2 (pelaksana selalu diawali L2):\n" +
  "• Upah tukang mingguan (borongan): \"L2 tukang minggu ini\" — nominal & minggu ke-n dihitung sistem; \"L2 retensi unit 3\" setelah unit selesai\n" +
  "• Catat utang material: \"L2 utang TB Maju semen 50 sak 6.500.000\" (+ foto nota); beli tunai: \"L2 bahan TB Maju semen 100 sak, pasir 12 rit 8,5 juta\"\n" +
  "• Bayar utang per toko: \"L2 cicilan TB Maju 3 juta\" atau \"L2 cicilan TB Maju lunas\"; lihat sisa utang: \"L2 utang\"\n" +
  "• Pembayaran lain-lain: \"L2 lain listrik proyek 600 rb\", \"L2 bensin 200 rb\", \"L2 sewa alat 1,5 juta\"\n" +
  "• Semua sekaligus, satu pesan satu baris per pembayaran: \"L2 pengajuan minggu ini\" lalu \"- tukang minggu ini\", \"- cicilan TB Maju 3 juta\", \"- lain listrik 600 rb\"\n" +
  "• Unit yang sedang dibangun: sistem menanyakan; balas YA atau \"L2 unit 1-7\". Koreksi pembagian bahan: \"L2 koreksi M-7 semen unit 1,2,3\"\n" +
  "• Setelah dibayar: foto bukti + \"L2 bayar M-3\". Lihat: \"L2 rab unit 3\", \"L2 borongan\"\n" +
  "• Owner: \"DP unit 5, 210 juta\", \"pelunasan unit 5\", \"saldo\", \"tagihan\", \"sudah 1\"/\"sudah semua\", " +
  "\"sudah transfer B 73,8 juta\", \"setujui M-3\" / \"setujui U-2\" / \"setujui L2-12\", \"tolak C-5 alasan ...\", \"utang\", \"ubah rekening C BCA 123 a.n. ...\", \"cairkan profit 200 juta\"";

// ---------------------------------------------------------------------------
// Jaringan: MKH Property
// ---------------------------------------------------------------------------

async function rahasiaSync(): Promise<string | null> {
  const { data, error } = await createAdminClient().rpc("get_sync_secret");
  if (error || !data) {
    logger.error("loonars2: rahasia sync tidak tersedia", { error: error?.message });
    return null;
  }
  return data as string;
}

type HasilMkh = { status?: string; balasan?: string; pesan?: unknown } & Record<string, unknown>;

async function panggilMkhProperty(nomor: string | null, aksi: string, data: Record<string, unknown>): Promise<HasilMkh | null> {
  const secret = await rahasiaSync();
  if (!secret) return null;
  try {
    const res = await fetch(MKH_PROPERTY_LOONARS2_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-sync-secret": secret },
      body: JSON.stringify({ nomor, aksi, data }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      logger.error("loonars2: MKH Property menolak", { status: res.status, aksi });
      return null;
    }
    return (await res.json()) as HasilMkh;
  } catch (error) {
    logger.error("loonars2: gagal menghubungi MKH Property", { aksi, error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

/**
 * Teks laporan Loonars 2 yang hanya-baca (saldo, tagihan, daftar utang) untuk
 * asisten WA owner (owner-assistant.ts). Sama dengan perintah "saldo" /
 * "tagihan" / "L2 utang"; MKH Property tetap memeriksa bahwa nomornya owner.
 * null = tidak tersedia (bukan owner, atau MKH Property tidak bisa dihubungi).
 */
export async function bacaLoonars2(sender: string, aksi: "saldo" | "tagihan" | "daftar_utang"): Promise<string | null> {
  const hasil = await panggilMkhProperty(sender, aksi, {});
  if (!hasil || hasil.status !== "ok" || typeof hasil.balasan !== "string") return null;
  return hasil.balasan;
}

export type Loonars2Outcome = { outcome: "not_applicable" } | { outcome: "handled"; reply: string };

const GAGAL = "⚠️ Sistem Loonars 2 sedang tidak bisa dihubungi. Coba lagi beberapa menit lagi.";

async function teruskan(sender: string, aksi: string, data: Record<string, unknown>): Promise<Loonars2Outcome> {
  const hasil = await panggilMkhProperty(sender, aksi, data);
  if (!hasil) return { outcome: "handled", reply: GAGAL };
  // Nomor tidak terdaftar, atau "ya"/"batal" tanpa konfirmasi yang
  // ditunggu -- bukan untuk modul ini, biarkan alur lain menangani.
  if (hasil.status === "abaikan" || hasil.status === "tidak_ada_pending") return { outcome: "not_applicable" };
  // Pesan lanjutan (pengajuan ke owner, kabar ke pelaksana) langsung dikirim.
  await flushLoonars2Outbox().catch(() => undefined);
  return { outcome: "handled", reply: typeof hasil.balasan === "string" ? hasil.balasan : "OK" };
}

function kategoriDariAi(t: CostRequestRecognition["requestType"]): "material" | "tukang" | "lain" {
  return t === "contractor_payment" ? "tukang" : t === "other_expense" ? "lain" : "material";
}

function rupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

/**
 * Susun data pesanan bahan kolektif dari teks pelaksana. Rincian item & catatan "untuk unit ..." dibaca AI;
 * total yang jelas ditulis pelaksana mengalahkan hitungan AI. Pembagian ke unit dilakukan database.
 */
export async function susunBahan(
  teks: string,
  utang: boolean,
  unit: string[],
  awal?: { toko?: string | null; nominal?: number | null },
): Promise<Record<string, unknown>> {
  const ai = await recognizeBahanPesanan(teks).catch(
    (): BahanRecognition => ({ toko: null, utang: false, nominal: null, items: [], notes: "Analisa AI gagal." }),
  );
  const toko = awal?.toko ?? ai.toko ?? teks.match(/\b((?:tb|toko|ud|cv)\s+[a-z0-9][\w .&-]*?)(?=\s+\d|\s*,|$)/i)?.[1]?.trim() ?? null;
  return {
    utang: utang || ai.utang,
    toko,
    deskripsi: teks.slice(0, 500),
    items: ai.items.map((it) => ({ nama: it.nama, qty: it.qty, satuan: it.satuan, nilai: it.nilai, untuk_unit: it.untukUnit?.map(String) ?? null })),
    nominal: awal?.nominal ?? ai.nominal ?? parseRupiah(teks.replace(UNIT_SEMUA_RE, " ")),
    unit,
  };
}

// ---------------------------------------------------------------------------
// Pesan teks
// ---------------------------------------------------------------------------
export async function tryHandleLoonars2Text(sender: string, text: string): Promise<Loonars2Outcome> {
  const perintah = parseLoonars2Perintah(text);
  if (!perintah) return { outcome: "not_applicable" };

  if (perintah.aksi === "bantuan") return { outcome: "handled", reply: LOONARS2_BANTUAN };

  if (perintah.aksi === "ajukan_ai") {
    const ai = await recognizeConstructionCostRequest(perintah.teks).catch(
      (): CostRequestRecognition => ({ isRequest: false, requestType: null, items: [], nominal: null, weekNumber: null, partyName: null, notes: "Analisa AI gagal." }),
    );
    // AI membaca "total" dari pesan (bisa jumlah beberapa item); angka
    // terbesar di teks hanya cadangan bila AI gagal.
    const nominal = ai.nominal ?? parseRupiah(perintah.teks.replace(UNIT_RE, ""));
    if (!nominal) {
      return { outcome: "handled", reply: "Nominal pengajuan belum terbaca. Tulis totalnya, mis. \"L2 unit 5 semen 20 sak total 1.300.000 TB Maju\"." };
    }
    const rincian = ai.items.length > 0 ? ai.items.map((it) => `${it.nama} (${rupiah(it.nilai)})`).join("; ") : null;
    return teruskan(sender, "ajukan", {
      unit: perintah.unit,
      kategori: kategoriDariAi(ai.requestType),
      deskripsi: rincian ? `${rincian}\n📩 ${perintah.teks.slice(0, 300)}` : perintah.teks.slice(0, 500),
      items: ai.items,
      toko: ai.partyName,
      nominal,
    });
  }

  if (perintah.aksi === "bahan_ai") {
    const data = await susunBahan(perintah.teks, perintah.utang, perintah.unit);
    if (!data.nominal) {
      return { outcome: "handled", reply: "Total pesanan bahan belum terbaca. Tulis totalnya, mis. \"L2 bahan TB Maju semen 100 sak, pasir 12 rit 8,5 juta\"." };
    }
    return teruskan(sender, "bahan", data);
  }

  if (perintah.aksi === "utang_foto") {
    // Utang tanpa menyebut unit = pesanan kolektif: item dibaca AI, dibagi ke unit yang sedang dibangun.
    if (perintah.unit.length === 0 && perintah.nominal) {
      const data = await susunBahan(perintah.teks ?? perintah.deskripsi, true, [], { toko: perintah.toko, nominal: perintah.nominal });
      return teruskan(sender, "utang", data);
    }
    return teruskan(sender, "utang", { unit: perintah.unit, toko: perintah.toko, deskripsi: perintah.deskripsi, nominal: perintah.nominal });
  }

  return teruskan(sender, perintah.aksi, perintah.data);
}

// ---------------------------------------------------------------------------
// Foto (bukti transfer / nota) -- keterangan foto memakai perintah yang sama
// ---------------------------------------------------------------------------
/**
 * Foto TANPA keterangan Loonars 2 dari nomor terdaftar: mungkin bukti transfer yang dikirim owner/pelaksana
 * (real incident 15 Okt 2026: owner membayar upah borongan Rp 13.000.000 dan mengirim foto tanpa keterangan;
 * foto itu tidak pernah sampai ke Loonars 2 dan dijawab "tidak cocok dengan pengajuan manapun" oleh modul lain).
 * Urutan sengaja hemat & aman: (1) tanya database dulu apakah ada yang menunggu pembayaran (nomor asing/tidak
 * ada pengajuan = lewat tanpa memanggil AI), (2) AI hanya MEMBACA nominal di foto, (3) database mencocokkan
 * nominal persis & unik ke satu pengajuan. Selain itu foto dilewatkan ke alur lain seperti biasa.
 */
/** Nomor yang bukan pengguna Loonars 2 (pelanggan, calon pembeli, ...): tidak ditanyakan lagi selama 30 menit, supaya foto mereka tidak membebani webhook/log. */
const NOMOR_BUKAN_L2 = new Map<string, number>();
const MASA_NOMOR_BUKAN_L2_MS = 30 * 60 * 1000;

async function bacaBuktiTransferOtomatis(sender: string, imageUrl: string): Promise<Loonars2Outcome> {
  const sampai = NOMOR_BUKAN_L2.get(sender);
  if (sampai !== undefined && sampai > Date.now()) return { outcome: "not_applicable" };
  const kandidat = await panggilMkhProperty(sender, "bukti_kandidat", {});
  if (kandidat?.status === "abaikan") {
    NOMOR_BUKAN_L2.set(sender, Date.now() + MASA_NOMOR_BUKAN_L2_MS);
    return { outcome: "not_applicable" };
  }
  if (!kandidat || kandidat.status !== "ok" || !(Number(kandidat.jumlah) > 0)) return { outcome: "not_applicable" };

  const image = await fetchImageAsBase64(imageUrl);
  if (!image || image.fetchError) return { outcome: "not_applicable" };
  const ai: TransferProofRecognition | null = await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(() => null);
  if (!ai || !ai.readable || ai.nominal === null || ai.nominal < 1000) return { outcome: "not_applicable" };

  const hasil = await panggilMkhProperty(sender, "bukti_transfer", {
    nominal: ai.nominal,
    penerima: ai.rekeningTujuan,
    tanggal: ai.tanggal,
    bukti_url: imageUrl,
  });
  if (!hasil || hasil.status === "abaikan" || hasil.status === "tidak_cocok") return { outcome: "not_applicable" };
  await flushLoonars2Outbox().catch(() => undefined);
  return { outcome: "handled", reply: typeof hasil.balasan === "string" ? hasil.balasan : "OK" };
}

export async function tryHandleLoonars2Image(sender: string, imageUrl: string, caption: string | null | undefined): Promise<Loonars2Outcome> {
  const perintah = parseLoonars2Perintah(caption ?? "");
  if (!perintah) return bacaBuktiTransferOtomatis(sender, imageUrl);
  if (perintah.aksi === "bantuan" || perintah.aksi === "ya" || perintah.aksi === "batal") return { outcome: "not_applicable" };

  if (
    perintah.aksi === "konfirmasi_transfer" ||
    perintah.aksi === "bayar_pengajuan" ||
    perintah.aksi === "bayar_kelompok" ||
    perintah.aksi === "receipt"
  ) {
    return teruskan(sender, perintah.aksi, { ...perintah.data, bukti_url: imageUrl });
  }

  // Foto nota utang: nominal/toko yang ditulis di keterangan dipakai lebih
  // dulu; yang kosong dibaca dari nota oleh Gemini (pembaca nota yang sama).
  if (perintah.aksi === "utang_foto") {
    let { nominal, toko } = perintah;
    let items: { nama: string; nilai: number }[] | undefined;
    if (!nominal || !toko) {
      const image = await fetchImageAsBase64(imageUrl);
      const ai: ExpenseReceiptRecognition | null =
        image && !image.fetchError
          ? await recognizeExpenseReceipt({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(() => null)
          : null;
      nominal = nominal ?? ai?.nominal ?? null;
      toko = toko ?? ai?.supplier ?? null;
      items = ai?.items.map((it) => ({ nama: it.nama, nilai: it.harga }));
    }
    if (!nominal) {
      return { outcome: "handled", reply: "⚠️ Total di nota tidak terbaca. Tulis totalnya di keterangan foto, mis. \"L2 utang TB Maju unit 5 semen 50 sak 6.500.000\"." };
    }
    return teruskan(sender, "utang", { unit: perintah.unit, toko, deskripsi: perintah.deskripsi, items, nominal, nota_url: imageUrl });
  }

  if (perintah.aksi === "bahan_ai") {
    const data = await susunBahan(perintah.teks, perintah.utang, perintah.unit);
    if (!data.nominal || !data.toko) {
      const image = await fetchImageAsBase64(imageUrl);
      const nota: ExpenseReceiptRecognition | null =
        image && !image.fetchError
          ? await recognizeExpenseReceipt({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(() => null)
          : null;
      data.nominal = data.nominal ?? nota?.nominal ?? null;
      data.toko = data.toko ?? nota?.supplier ?? null;
      if ((data.items as unknown[]).length === 0 && nota) data.items = nota.items.map((it) => ({ nama: it.nama, nilai: it.harga }));
    }
    if (!data.nominal) {
      return { outcome: "handled", reply: "⚠️ Total di nota tidak terbaca. Tulis totalnya di keterangan foto, mis. \"L2 bahan TB Maju semen 100 sak 8,5 juta\"." };
    }
    return teruskan(sender, "bahan", { ...data, nota_url: imageUrl });
  }

  if (perintah.aksi === "ajukan_ai") {
    const image = await fetchImageAsBase64(imageUrl);
    const ai: ExpenseReceiptRecognition =
      image && !image.fetchError
        ? await recognizeExpenseReceipt({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
            (): ExpenseReceiptRecognition => ({ readable: false, items: [], nominal: null, tanggal: null, supplier: null, notes: "Analisa AI gagal." }),
          )
        : { readable: false, items: [], nominal: null, tanggal: null, supplier: null, notes: "Foto tidak bisa diunduh." };
    // Total yang ditulis pelaksana di keterangan foto mengalahkan bacaan nota.
    const nominal = parseRupiah(perintah.teks.replace(UNIT_RE, "")) ?? ai.nominal;
    if (!nominal) {
      return { outcome: "handled", reply: "⚠️ Total di nota tidak terbaca. Kirim ulang foto yang lebih jelas, atau tulis totalnya di keterangan foto." };
    }
    const kategori = /\b(tukang|upah|borongan|gaji)\b/i.test(perintah.teks) ? "tukang" : "material";
    const rincian = ai.items.length > 0 ? ai.items.map((it) => `${it.nama} (${rupiah(it.harga)})`).join("; ") : null;
    return teruskan(sender, "ajukan", {
      unit: perintah.unit,
      kategori,
      deskripsi: [rincian, `📩 ${perintah.teks.slice(0, 300)}`].filter(Boolean).join("\n"),
      items: ai.items.map((it) => ({ nama: it.nama, nilai: it.harga })),
      toko: ai.supplier,
      nominal,
      nota_url: imageUrl,
    });
  }

  // Perintah teks murni (saldo, setujui, ...) yang kebetulan dikirim
  // sebagai keterangan foto -- tetap diproses tanpa fotonya.
  return teruskan(sender, perintah.aksi, perintah.data);
}

// ---------------------------------------------------------------------------
// Antrean pesan keluar dari MKH Property
// ---------------------------------------------------------------------------
export async function flushLoonars2Outbox(): Promise<{ dikirim: number; gagal: number }> {
  const ambil = await panggilMkhProperty(null, "outbox_ambil", {});
  const daftar = Array.isArray(ambil?.pesan) ? (ambil.pesan as { id: number; nomor: string; pesan: string; gambar_url: string | null }[]) : [];
  if (daftar.length === 0) return { dikirim: 0, gagal: 0 };

  const hasil: { id: number; ok: boolean; error?: string }[] = [];
  for (const p of daftar) {
    let kirim = p.gambar_url ? await sendWhatsAppImage(p.nomor, p.gambar_url, p.pesan) : await sendWhatsAppText(p.nomor, p.pesan);
    // Foto gagal (URL Whacenter kedaluwarsa, dsb.) -- pesannya tetap harus sampai.
    if (!kirim.success && p.gambar_url) kirim = await sendWhatsAppText(p.nomor, p.pesan);
    hasil.push({ id: p.id, ok: kirim.success, error: kirim.error });
  }
  await panggilMkhProperty(null, "outbox_selesai", { hasil });
  const dikirim = hasil.filter((h) => h.ok).length;
  return { dikirim, gagal: hasil.length - dikirim };
}
