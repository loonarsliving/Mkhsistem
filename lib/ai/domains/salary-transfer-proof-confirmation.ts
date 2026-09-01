import "server-only";

import { fetchImageAsBase64 } from "@/lib/ai/domains/construction-progress-vision";
import { recognizeTransferProof, type TransferProofRecognition } from "@/lib/ai/domains/transfer-proof-recognition";
import { isNominalMismatch, extractAccountDigits } from "@/lib/ai/domains/transfer-proof-confirmation";
import { createAdminClient } from "@/lib/supabase/admin";

export type SalaryTransferProofOutcome =
  | { outcome: "not_super_admin" }
  | { outcome: "no_pending_salary" }
  | { outcome: "no_amount_match" }
  | { outcome: "ambiguous" }
  | {
      outcome: "confirmed";
      employeeName: string;
      amount: number;
      periode: string;
      bankAccountNumber: string;
      ai: TransferProofRecognition;
      recipients: { name: string; phone: string }[];
    };

type Supa = ReturnType<typeof createAdminClient>;

type PendingSalaryRow = {
  id: string;
  employee_id: string;
  branch_id: string;
  amount: number | string;
  bank_account_number: string;
  period_month: number;
  period_year: number;
  employee: { full_name: string; phone: string | null } | { full_name: string; phone: string | null }[] | null;
};

function singleEmployee(row: PendingSalaryRow): { full_name: string; phone: string | null } {
  const e = row.employee;
  if (Array.isArray(e)) return e[0] ?? { full_name: "-", phone: null };
  return e ?? { full_name: "-", phone: null };
}

/** Branch's Kepala Cabang + the employee being paid -- same recipient shape as transfer-proof-confirmation.ts's resolveRecipients, just simpler since the employee here is already known directly (no admin_email label to parse). */
async function resolveRecipients(supabase: Supa, branchId: string, employeeName: string, employeePhone: string | null): Promise<{ name: string; phone: string }[]> {
  const recipients: { name: string; phone: string }[] = [];
  const { data: branchEmployees } = await supabase
    .from("employees")
    .select("full_name, phone, role:role_id(key)")
    .eq("branch_id", branchId)
    .not("phone", "is", null)
    .is("deleted_at", null)
    .eq("employment_status", "active");
  for (const emp of branchEmployees ?? []) {
    if ((emp.role as unknown as { key: string } | null)?.key === "kepala_cabang" && emp.phone) {
      recipients.push({ name: emp.full_name, phone: emp.phone });
    }
  }
  if (employeePhone && !recipients.some((r) => r.phone === employeePhone)) {
    recipients.push({ name: employeeName, phone: employeePhone });
  }
  return recipients;
}

/**
 * Owner's ask: gaji should work like bahan/tukang -- Super Admin sends the
 * bukti transfer photo via WhatsApp instead of manually clicking "Sudah
 * Ditransfer" in the web app with no photo ever recorded. Matches the same
 * nominal-then-account-tiebreak logic tryConfirmTransferProofViaWhatsApp
 * uses for bahan/tukang (transfer-proof-confirmation.ts), against
 * employee_salary_submissions instead of finance_pending_transfers.
 *
 * Deliberately conservative: unlike the bahan/tukang flow, this has no FIFO
 * fallback and no group-sum matching -- an unreadable photo or an
 * unresolvable multi-match returns a non-blocking outcome (no_pending_salary
 * / no_amount_match / ambiguous) so the caller falls through to the
 * existing bahan/tukang matcher instead of guessing which employee's salary
 * a photo belongs to. A wrong guess here means a real person told "your
 * salary is transferred" when it wasn't, or a real transfer failing to mark
 * an employee paid at all.
 */
export async function trySalaryTransferProofViaWhatsApp(sender: { id: string; name: string; roleKey: string | null }, imageUrl: string): Promise<SalaryTransferProofOutcome> {
  if (sender.roleKey !== "super_admin") {
    return { outcome: "not_super_admin" };
  }

  const supabase = createAdminClient();
  const { data: pendingRaw } = await supabase
    .from("employee_salary_submissions")
    .select("id, employee_id, branch_id, amount, bank_account_number, period_month, period_year, employee:employee_id(full_name, phone)")
    .eq("status", "pending_transfer")
    .order("created_at", { ascending: true });
  const pending = (pendingRaw ?? []) as unknown as PendingSalaryRow[];

  if (pending.length === 0) {
    return { outcome: "no_pending_salary" };
  }

  const image = await fetchImageAsBase64(imageUrl);
  const ai: TransferProofRecognition =
    image && !image.fetchError
      ? await recognizeTransferProof({ imageBase64: image.data, imageMimeType: image.mimeType }).catch(
          (): TransferProofRecognition => ({ readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Analisa AI gagal." }),
        )
      : { readable: false, nominal: null, tanggal: null, rekeningTujuan: null, notes: "Foto tidak bisa diunduh untuk dianalisa AI." };

  if (!ai.readable || ai.nominal === null) {
    return { outcome: "no_pending_salary" };
  }

  const amountMatches = pending.filter((p) => !isNominalMismatch(Number(p.amount), ai.nominal));
  if (amountMatches.length === 0) {
    return { outcome: "no_amount_match" };
  }

  let target = amountMatches[0];
  if (amountMatches.length > 1) {
    const aiAccount = extractAccountDigits(ai.rekeningTujuan);
    const accountMatch = aiAccount ? amountMatches.find((row) => extractAccountDigits(row.bank_account_number) === aiAccount) : undefined;
    if (!accountMatch) {
      return { outcome: "ambiguous" };
    }
    target = accountMatch;
  }

  const { data: claimed } = await supabase
    .from("employee_salary_submissions")
    .update({ status: "transferred", transferred_by: sender.id, transferred_at: new Date().toISOString() })
    .eq("id", target.id)
    .eq("status", "pending_transfer")
    .select("id, employee_id, branch_id, amount, bank_account_number, period_month, period_year")
    .maybeSingle();

  if (!claimed) {
    // Someone else (another Super Admin, or the manual "Sudah Ditransfer" button) claimed it between read and write.
    return { outcome: "no_pending_salary" };
  }

  const employee = singleEmployee(target);
  const periode = new Date(claimed.period_year, claimed.period_month - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  const amount = Number(claimed.amount);

  await supabase.from("mkc_notifications").insert({
    user_id: claimed.employee_id,
    type: "system",
    category: "salary_transferred",
    title: `Gaji Anda Telah Ditransfer — ${periode}`,
    body: `✅ Gaji periode ${periode} sebesar Rp ${amount.toLocaleString("id-ID")} telah ditransfer ke rekening ${claimed.bank_account_number}.`,
    link: "/hr/salary",
    metadata: { salary_submission_id: claimed.id },
  });

  const recipients = await resolveRecipients(supabase, claimed.branch_id, employee.full_name, employee.phone);

  return {
    outcome: "confirmed",
    employeeName: employee.full_name,
    amount,
    periode,
    bankAccountNumber: claimed.bank_account_number,
    ai,
    recipients,
  };
}
