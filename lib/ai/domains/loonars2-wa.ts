import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeConstructionCostRequest, type CostRequestRecognition } from "@/lib/ai/domains/loonars-coffee-recognition";
import { recognizeExpenseReceipt, type ExpenseReceiptRecognition } from "@/lib/ai/domains/expense-receipt-recognition";
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
  | "ya"
  | "batal";

export type Loonars2Perintah =
  | { aksi: Loonars2Aksi; data: Record<string, unknown> }
  /** Pengajuan material/tukang pelaksana -- rinciannya dibaca Gemini. */
  | { aksi: "ajukan_ai"; unit: string | null; teks: string }
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

const PREFIX_RE = /^(?:l2|loonars\s*2)\b[\s:,.-]*/i;

function parseAtasNama(teks: string): string | null {
  const m = teks.match(/\b(?:a\.?\s?n\.?|atas\s+nama)\s+(.+)$/i);
  return m ? m[1].trim().replace(/[.,]$/, "") : null;
}

export function parseLoonars2Perintah(input: string): Loonars2Perintah | null {
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
  "Perintah Loonars 2:\n" +
  "• Pelaksana: \"L2 unit 5 semen 20 sak 1.300.000 TB Maju\" (boleh kirim foto nota dengan keterangan yang sama), \"L2 bayar L2-12\" + foto bukti\n" +
  "• Owner: \"DP unit 5, 210 juta\", \"pelunasan unit 5\", \"saldo\", \"tagihan\", \"sudah 1\"/\"sudah semua\", " +
  "\"sudah transfer B 73,8 juta\", \"setujui L2-12\", \"tolak L2-12 alasan ...\", \"ubah rekening C BCA 123 a.n. ...\", \"cairkan profit 200 juta\"";

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

  return teruskan(sender, perintah.aksi, perintah.data);
}

// ---------------------------------------------------------------------------
// Foto (bukti transfer / nota) -- keterangan foto memakai perintah yang sama
// ---------------------------------------------------------------------------
export async function tryHandleLoonars2Image(sender: string, imageUrl: string, caption: string | null | undefined): Promise<Loonars2Outcome> {
  const perintah = parseLoonars2Perintah(caption ?? "");
  if (!perintah || perintah.aksi === "bantuan" || perintah.aksi === "ya" || perintah.aksi === "batal") return { outcome: "not_applicable" };

  if (perintah.aksi === "konfirmasi_transfer" || perintah.aksi === "bayar_pengajuan" || perintah.aksi === "receipt") {
    return teruskan(sender, perintah.aksi, { ...perintah.data, bukti_url: imageUrl });
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
