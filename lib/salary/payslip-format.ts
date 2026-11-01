/**
 * Pure helpers for the "bukti transfer gaji → slip gaji" WhatsApp flow
 * (lib/ai/domains/salary-payslip-whatsapp.ts). Kept free of server-only
 * imports so the matching rules are unit-tested directly
 * (tests/unit/lib/salary-payslip.test.ts).
 */

/** One transfer line read off a bank screenshot (single transfer or a bulk/payroll list). */
export interface RecognizedTransferRow {
  namaPenerima: string | null;
  bank: string | null;
  rekening: string | null;
  nominal: number | null;
}

/** An employee_salary_submissions row, reduced to what matching needs. */
export interface SalaryCandidate {
  id: string;
  status: "pending_transfer" | "transferred";
  amount: number;
  bankAccountNumber: string;
  periodMonth: number;
  periodYear: number;
}

export type RowMatch =
  | { kind: "matched"; row: RecognizedTransferRow; submissionId: string }
  /** The same account + amount was already marked transferred (e.g. the second, overlapping screenshot of one batch). */
  | { kind: "already_transferred"; row: RecognizedTransferRow; submissionId: string }
  /** More than one pending salary fits and the batch period can't decide between them. */
  | { kind: "ambiguous"; row: RecognizedTransferRow }
  | { kind: "unmatched"; row: RecognizedTransferRow };

/** Longest run of >= 6 digits (spaces inside a run allowed) -- same rule as transfer-proof-confirmation.ts's extractAccountDigits. */
export function accountDigits(text: string | null | undefined): string | null {
  if (!text) return null;
  const runs = text.match(/\d+(?:[ .-]\d+)*/g);
  if (!runs) return null;
  let longest = "";
  for (const run of runs) {
    const joined = run.replace(/[ .-]/g, "");
    if (joined.length >= 6 && joined.length > longest.length) longest = joined;
  }
  return longest || null;
}

/** Salary amounts must match to the rupiah, give or take a transfer-fee-sized rounding (Rp 1.000). */
export function salaryAmountMatches(expected: number, read: number | null): boolean {
  if (read === null || !Number.isFinite(read)) return false;
  return Math.abs(read - expected) <= 1000;
}

const periodKey = (c: { periodMonth: number; periodYear: number }) => c.periodYear * 100 + c.periodMonth;

/**
 * Matches every transfer row to a salary submission on BOTH exact account
 * number AND amount -- never on amount alone (one screenshot routinely
 * holds several Rp 2.000.000 transfers). When one row fits several pending
 * submissions (same employee, same amount, an older period never marked
 * paid), the period shared by the batch's unambiguous matches wins; with
 * no such tie-breaker the row is reported ambiguous rather than guessed.
 * A submission is never claimed by two rows.
 */
export function matchSalaryTransfers(rows: RecognizedTransferRow[], candidates: SalaryCandidate[]): RowMatch[] {
  const fits = rows.map((row) => {
    const digits = accountDigits(row.rekening);
    if (!digits) return [] as SalaryCandidate[];
    return candidates.filter((c) => accountDigits(c.bankAccountNumber) === digits && salaryAmountMatches(c.amount, row.nominal));
  });

  // Batch period = most common period among rows with exactly one pending fit.
  const votes = new Map<number, number>();
  for (const f of fits) {
    const pending = f.filter((c) => c.status === "pending_transfer");
    if (pending.length === 1) votes.set(periodKey(pending[0]), (votes.get(periodKey(pending[0])) ?? 0) + 1);
  }
  let batchPeriod: number | null = null;
  let best = 0;
  for (const [key, count] of votes) {
    if (count > best) {
      best = count;
      batchPeriod = key;
    } else if (count === best) {
      batchPeriod = null;
    }
  }

  const claimed = new Set<string>();
  return rows.map((row, i): RowMatch => {
    const pending = fits[i].filter((c) => c.status === "pending_transfer" && !claimed.has(c.id));
    let pick: SalaryCandidate | null = null;
    if (pending.length === 1) pick = pending[0];
    else if (pending.length > 1) {
      const inBatch = batchPeriod === null ? [] : pending.filter((c) => periodKey(c) === batchPeriod);
      if (inBatch.length === 1) pick = inBatch[0];
      else return { kind: "ambiguous", row };
    }
    if (pick) {
      claimed.add(pick.id);
      return { kind: "matched", row, submissionId: pick.id };
    }
    const done = fits[i].filter((c) => c.status === "transferred");
    if (done.length > 0) {
      const sameBatch = batchPeriod === null ? undefined : done.find((c) => periodKey(c) === batchPeriod);
      return { kind: "already_transferred", row, submissionId: (sameBatch ?? done[0]).id };
    }
    return { kind: "unmatched", row };
  });
}

/** "•••• 7150" -- the slip is sent as a picture over WhatsApp, so the full account number never goes on it. */
export function maskAccount(account: string): string {
  const digits = accountDigits(account) ?? account.replace(/\D/g, "");
  return digits.length <= 4 ? digits : `•••• ${digits.slice(-4)}`;
}

export function formatPeriode(month: number, year: number): string {
  return new Date(year, month - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

export function rupiah(value: number): string {
  return `Rp ${Math.round(value).toLocaleString("id-ID")}`;
}

/** Slip number shown on the card: SG-YYYYMM-<first 8 of the submission id>. */
export function payslipNumber(submissionId: string, month: number, year: number): string {
  return `SG-${year}${String(month).padStart(2, "0")}-${submissionId.replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}

export function buildPayslipCaption(input: { employeeName: string; periode: string; amount: number }): string {
  return (
    `🧾 *Slip Gaji ${input.periode}*\n` +
    `Halo ${input.employeeName.trim()}, gaji Anda periode ${input.periode} sebesar *${rupiah(input.amount)}* telah ditransfer.\n` +
    "Terima kasih atas kerja kerasnya. — PT Maha Karya Haluoleo"
  );
}

/** Super Admin's reply after a screenshot was processed. */
export function buildPayslipAdminReply(input: {
  sent: { name: string; amount: number; periode: string; delivered: boolean; error?: string | null }[];
  alreadyTransferred: string[];
  problems: string[];
}): string {
  const lines: string[] = [];
  if (input.sent.length > 0) {
    const total = input.sent.reduce((s, r) => s + r.amount, 0);
    lines.push(`✅ ${input.sent.length} gaji dicatat sudah ditransfer (total ${rupiah(total)}):`);
    for (const r of input.sent) {
      lines.push(`• ${r.name.trim()} — ${rupiah(r.amount)} (${r.periode}) ${r.delivered ? "🧾 slip terkirim" : `⚠️ slip GAGAL terkirim${r.error ? `: ${r.error}` : ""}`}`);
    }
  }
  if (input.alreadyTransferred.length > 0) {
    lines.push(`ℹ️ Sudah tercatat sebelumnya (slip tidak dikirim ulang): ${input.alreadyTransferred.map((n) => n.trim()).join(", ")}`);
  }
  if (input.problems.length > 0) {
    lines.push("⚠️ Tidak bisa dicocokkan otomatis, cek manual di /hr/salary:");
    for (const p of input.problems) lines.push(`• ${p}`);
  }
  return lines.join("\n");
}

export function describeRow(row: RecognizedTransferRow): string {
  const parts = [row.namaPenerima?.trim() || "(nama tidak terbaca)"];
  if (row.nominal !== null) parts.push(rupiah(row.nominal));
  if (row.rekening) parts.push(`rek. ${maskAccount(row.rekening)}`);
  return parts.join(" — ");
}
