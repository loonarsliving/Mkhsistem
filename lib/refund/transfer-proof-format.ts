/**
 * Pure helpers for refund transfer proofs (0289) -- caption parsing, customer
 * matching and the message sent to the customer. No server-only imports so
 * they can be unit-tested directly.
 */

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agt: 8, agustus: 8, ags: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10,
  nov: 11, november: 11,
  des: 12, desember: 12,
};

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export interface RefundProofCaption {
  /** Customer name fragment, or their list number ("7"). */
  query: string;
  /** 1-12 when the caption names a termin month. */
  month?: number;
  /** Full year when given ("okt 26" -> 2026). */
  year?: number;
}

/**
 * "REFUND <nama / no urut> [bulan [tahun]]", case-insensitive, e.g.
 * "REFUND Budi", "refund 7", "REFUND Siti okt 26",
 * "REFUND joko okt-2026", "REFUND dewi 10/2026". Anything not starting
 * with the word REFUND is not a refund proof.
 */
export function parseRefundProofCaption(caption: string | null | undefined): RefundProofCaption | null {
  const match = (caption ?? "").trim().match(/^refund\s+(.+)$/i);
  if (!match) return null;
  let rest = match[1].trim();

  let month: number | undefined;
  let year: number | undefined;

  // Trailing "10/2026", "10-26", "10/26"
  const numeric = rest.match(/\s+(\d{1,2})[/-](\d{2}|\d{4})$/);
  if (numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12) {
    month = Number(numeric[1]);
    year = normalizeYear(numeric[2]);
    rest = rest.slice(0, numeric.index).trim();
  } else {
    // Trailing "okt", "okt 26", "okt-26", "oktober 2026"
    const named = rest.match(/\s+([a-z]+)(?:[\s-]+(\d{2}|\d{4}))?$/i);
    const key = named?.[1]?.toLowerCase();
    if (named && key && MONTHS[key]) {
      month = MONTHS[key];
      year = named[2] ? normalizeYear(named[2]) : undefined;
      rest = rest.slice(0, named.index).trim();
    }
  }

  if (!rest) return null;
  return { query: rest, month, year };
}

function normalizeYear(value: string): number {
  const n = Number(value);
  return value.length === 2 ? 2000 + n : n;
}

function nameTokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Customers matching the caption's query: a bare number matches the list
 * number (sort_order); otherwise every query word must be the start of a
 * word in the customer's name ("bud" -> "Budi Santoso",
 * "andi nur" -> "Andi Nur Rahman" but not "Dr. Andi Wijaya").
 */
export function matchRefundCustomers<T extends { name: string; sortOrder: number }>(customers: T[], query: string): T[] {
  const trimmed = query.trim();
  if (/^\d{1,3}$/.test(trimmed)) return customers.filter((c) => c.sortOrder === Number(trimmed));

  const wanted = nameTokens(trimmed);
  if (wanted.length === 0) return [];
  return customers.filter((c) => {
    const have = nameTokens(c.name);
    return wanted.every((w) => have.some((h) => h.startsWith(w)));
  });
}

/** "2026-10-01" -> "Oktober 2026" */
export function formatRefundMonthLong(dueMonth: string): string {
  const [year, month] = dueMonth.split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${year}`;
}

function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

/** Caption sent to the customer with the transfer proof. */
export function buildRefundProofCustomerMessage(input: {
  customerName: string;
  installment: { dueMonth: string; amount: number } | null;
  paidAmount: number;
  remainingAmount: number;
}): string {
  const termin = input.installment
    ? ` termin ${formatRefundMonthLong(input.installment.dueMonth)} sebesar ${rupiah(input.installment.amount)}`
    : "";
  return (
    `Yth. Bapak/Ibu ${input.customerName},\n\n` +
    `Berikut kami kirimkan bukti transfer pembayaran refund${termin}.\n\n` +
    `Total terbayar: ${rupiah(input.paidAmount)}\n` +
    `Sisa refund: ${rupiah(input.remainingAmount)}\n\n` +
    "Terima kasih.\nPT Maha Karya Haluoleo"
  );
}
