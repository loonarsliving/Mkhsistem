/**
 * Indonesian number-to-words ("terbilang"), for the Kwitansi Tanda Jadi
 * booking receipt's `Terbilang` line (see
 * features/siteplan/components/booking-receipt-sheet.tsx).
 *
 * A receipt is a financial document handed to a buyer, so the words are
 * computed here in application code from the same stored `amount` the digits
 * are rendered from -- never typed by hand and never produced by a model.
 *
 * Rupiah amounts are whole-currency, so the input is rounded to an integer
 * before conversion; sub-rupiah precision has no spoken form anyway.
 */

const ONES = [
  "nol",
  "satu",
  "dua",
  "tiga",
  "empat",
  "lima",
  "enam",
  "tujuh",
  "delapan",
  "sembilan",
  "sepuluh",
  "sebelas",
];

/**
 * Converts a POSITIVE integer to Indonesian words, without a currency suffix.
 * Follows the standard contraction rules: `sebelas` (not "satu belas"),
 * `seratus`/`seribu` (not "satu ratus"/"satu ribu").
 *
 * Zero is not a case here -- a zero remainder returns "" so it disappears
 * from the composed words entirely. Returning "nol" instead would leak a
 * stray zero into the middle of a larger number (1_250_000_000 would read
 * "satu miliar dua ratus lima puluh NOL juta"), not just at the end where a
 * trailing-word trim could catch it. The only real "nol" is the whole amount
 * being zero, which terbilang() handles before ever calling this.
 *
 * Scale words stop at `triliun`; anything at or above 1_000_000_000_000_000
 * would need `kuadriliun` and is far outside what this app ever prints, so it
 * is left unhandled rather than approximated (the guard in terbilang() throws
 * instead of silently emitting a wrong figure onto a receipt).
 */
function convert(value: number): string {
  if (value <= 0) return "";
  if (value < 12) return ONES[value];
  if (value < 20) return join(convert(value - 10), "belas");
  if (value < 100) return join(convert(Math.floor(value / 10)), "puluh", convert(value % 10));
  if (value < 200) return join("seratus", convert(value - 100));
  if (value < 1_000) return join(convert(Math.floor(value / 100)), "ratus", convert(value % 100));
  if (value < 2_000) return join("seribu", convert(value - 1_000));
  if (value < 1_000_000) return join(convert(Math.floor(value / 1_000)), "ribu", convert(value % 1_000));
  if (value < 1_000_000_000) return join(convert(Math.floor(value / 1_000_000)), "juta", convert(value % 1_000_000));
  if (value < 1_000_000_000_000) return join(convert(Math.floor(value / 1_000_000_000)), "miliar", convert(value % 1_000_000_000));
  return join(convert(Math.floor(value / 1_000_000_000_000)), "triliun", convert(value % 1_000_000_000_000));
}

/** Joins word fragments with single spaces, dropping the empty ones a zero remainder produces. */
function join(...parts: string[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * `terbilang(5_000_000)` -> `"lima juta"`.
 *
 * Returns `"nol"` for 0. Throws on a negative, non-finite, or
 * beyond-triliun amount rather than printing something wrong onto a receipt.
 */
export function terbilang(amount: number): string {
  if (!Number.isFinite(amount)) throw new Error("terbilang: nilai tidak valid");
  const rounded = Math.round(amount);
  if (rounded < 0) throw new Error("terbilang: nilai tidak boleh negatif");
  if (rounded >= 1_000_000_000_000_000) throw new Error("terbilang: nilai di luar jangkauan");
  if (rounded === 0) return "nol";
  return convert(rounded);
}

/** Capitalises the first letter only — how the words are set on the printed kwitansi ("Lima Juta Rupiah" style line reads `Lima juta rupiah`). */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The full receipt line: `terbilangRupiah(5_000_000)` -> `"Lima juta rupiah"`. */
export function terbilangRupiah(amount: number): string {
  return capitalizeFirst(`${terbilang(amount)} rupiah`);
}
