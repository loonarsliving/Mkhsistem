/**
 * Penjaga angka Asisten Owner: setiap nominal di jawaban model harus berasal
 * dari DATA tool (aturan FRIDAY / AI CFO: angka dari kode, bukan model).
 *
 * Format yang dikenali (gaya id-ID): "Rp 317.574.950", "184,4 jt", "1,49 M",
 * "51 juta", "8.978.000", "250rb", angka polos "1490000000". Pembulatan
 * wajar (≤ 1%) dianggap sama, mis. 184.402.950 → "184,4 jt".
 *
 * Yang sengaja diabaikan (terlalu kecil / bukan nominal): nilai < 1.000
 * (jumlah unit, persen, hari) dan tahun / bagian tanggal.
 */

const SATUAN: Record<string, number> = {
  rb: 1e3,
  ribu: 1e3,
  k: 1e3,
  jt: 1e6,
  juta: 1e6,
  m: 1e9,
  miliar: 1e9,
  milyar: 1e9,
  t: 1e12,
  triliun: 1e12,
};

const POLA_ANGKA =
  /(?<![\d.,])(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?(?:\s*(rb|ribu|k|jt|juta|miliar|milyar|m|triliun|t)(?![a-z]))?/gi;

const POLA_TANGGAL = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|\b\d{4}-\d{2}\b|\b\d{1,2}[.:]\d{2}\b/g;

/** Semua nilai nominal (≥ 1.000) di teks, setelah satuan diterapkan. */
export function nilaiAngka(teks: string): number[] {
  const bersih = teks.replace(POLA_TANGGAL, " ");
  const hasil: number[] = [];
  for (const m of bersih.matchAll(POLA_ANGKA)) {
    const bulat = Number(m[1].replace(/\./g, ""));
    const pecahan = m[2] ? Number(`0.${m[2]}`) : 0;
    const satuan = m[3] ? SATUAN[m[3].toLowerCase()] : 1;
    const nilai = (bulat + pecahan) * satuan;
    if (!Number.isFinite(nilai) || nilai < 1000) continue;
    // Tahun polos (mis. "2026") bukan nominal.
    if (!m[2] && !m[3] && /^\d{4}$/.test(m[1]) && bulat >= 1900 && bulat <= 2100) continue;
    hasil.push(nilai);
  }
  return hasil;
}

/** Nominal di jawaban yang TIDAK ada di sumber (toleransi pembulatan 1%). */
export function angkaTakBerdasar(jawaban: string, sumber: string): number[] {
  const ada = nilaiAngka(sumber);
  return nilaiAngka(jawaban).filter(
    (a) => !ada.some((v) => Math.abs(v - a) <= Math.max(1, Math.abs(v) * 0.01)),
  );
}
