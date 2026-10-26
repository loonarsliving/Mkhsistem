/**
 * Pengajuan Biaya Villa (0307): labels and pure helpers. The record lives in
 * the villa app's villa_pengajuan_biaya; mkc_biaya_create re-checks every
 * rule below, these only drive the form.
 */

export const BIAYA_KATEGORI = ["laundry", "netflix", "lain_lain"] as const;
export const BIAYA_JENIS = ["permintaan_dana", "reimburse"] as const;
export type BiayaKategori = (typeof BIAYA_KATEGORI)[number];
export type BiayaJenis = (typeof BIAYA_JENIS)[number];

export const BIAYA_KATEGORI_LABELS: Record<BiayaKategori, string> = { laundry: "Laundry", netflix: "Netflix", lain_lain: "Lain-lain" };
export const BIAYA_JENIS_LABELS: Record<BiayaJenis, string> = {
  permintaan_dana: "Permintaan dana",
  reimburse: "Reimburse (sudah dibayar sendiri)",
};
export const BIAYA_STATUS_LABELS: Record<string, string> = {
  diajukan: "Menunggu Finance",
  disetujui: "Disetujui, menunggu transfer",
  ditolak: "Ditolak",
  ditransfer: "Sudah ditransfer",
  dibatalkan: "Dibatalkan",
};

/** Max size of one file (the villa bucket allows 10MB; photos are shrunk to ~300KB first). */
export const BIAYA_FILE_MAX_BYTES = 5 * 1024 * 1024;

export function biayaKode(nomor: number): string {
  return `PB-${String(nomor).padStart(4, "0")}`;
}

export function biayaNama(kategori: BiayaKategori, kategoriNama: string | null): string {
  return kategori === "lain_lain" && kategoriNama ? kategoriNama : BIAYA_KATEGORI_LABELS[kategori];
}

export function formatRupiah(n: number): string {
  return `Rp${Math.round(n).toLocaleString("id-ID")}`;
}

/** This month and last month (Asia/Jakarta), "YYYY-MM" -- the months a request may be for. */
export function biayaPeriodeOptions(now: Date = new Date()): string[] {
  const [y, m] = now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" }).split("-").map(Number);
  const ini = `${y}-${String(m).padStart(2, "0")}`;
  const lalu = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  return [ini, lalu];
}

export function biayaPeriodeLabel(periode: string): string {
  const [y, m] = periode.split("-").map(Number);
  if (!y || !m) return periode;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * What the bytes really are (never the browser's label): JPEG, PNG, WebP or
 * PDF, else null.
 */
export function sniffBiayaFile(bytes: Uint8Array): { contentType: string; ext: string } | null {
  const at = (i: number) => bytes[i];
  if (bytes.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return { contentType: "image/jpeg", ext: "jpg" };
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return { contentType: "image/png", ext: "png" };
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { contentType: "image/webp", ext: "webp" };
  if (bytes.length >= 5 && ascii(0, 5) === "%PDF-") return { contentType: "application/pdf", ext: "pdf" };
  return null;
}

/** "Rp 350.000" / "350000" → 350000; null when empty or not a positive whole number. */
export function parseNominal(text: string): number | null {
  const digits = text.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
