import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for the salary input module (0189). Every write goes through
 * submit_employee_salary / mark_salary_transferred instead of a table
 * write, so the branch scoping and the notification fan-out can't be
 * bypassed from the client.
 */

export interface SalaryCandidate {
  id: string;
  fullName: string;
  employeeCode: string;
  branchName: string;
  /** Paid on a different schedule than the rest of their branch (0192) -- doesn't block the branch's auto-summary. */
  separateSchedule: boolean;
}

/** Active employees a Kepala Cabang can submit a salary for -- their own branch only, scoped by RLS. Queries employees directly (not v_employee_directory) since that view doesn't carry salary_separate_schedule. */
export async function listSalaryCandidates(supabase: TypedSupabaseClient, branchId?: string | null): Promise<SalaryCandidate[]> {
  let query = supabase
    .from("employees")
    .select("id, full_name, employee_code, salary_separate_schedule, branch:branch_id(name)")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .order("full_name", { ascending: true });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    employeeCode: row.employee_code ?? "-",
    branchName: (row.branch as unknown as { name: string } | null)?.name ?? "-",
    separateSchedule: row.salary_separate_schedule,
  }));
}

export interface SalarySubmission {
  id: string;
  employeeId: string;
  employeeName: string;
  branchName: string | null;
  periodMonth: number;
  periodYear: number;
  amount: number;
  bankName: string | null;
  bankAccountNumber: string;
  bankAccountHolder: string | null;
  note: string | null;
  status: "pending_transfer" | "transferred";
  submittedByName: string | null;
  transferredByName: string | null;
  transferredAt: string | null;
  summarySentAt: string | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  employee_id: string;
  period_month: number;
  period_year: number;
  amount: number;
  bank_name: string | null;
  bank_account_number: string;
  bank_account_holder: string | null;
  note: string | null;
  status: "pending_transfer" | "transferred";
  transferred_at: string | null;
  summary_sent_at: string | null;
  created_at: string;
  employee: { full_name: string } | null;
  branch: { name: string } | null;
  submitter: { full_name: string } | null;
  transferrer: { full_name: string } | null;
}

function mapRow(row: RawRow): SalarySubmission {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee?.full_name ?? "—",
    branchName: row.branch?.name ?? null,
    periodMonth: row.period_month,
    periodYear: row.period_year,
    amount: row.amount,
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountHolder: row.bank_account_holder,
    note: row.note,
    status: row.status,
    submittedByName: row.submitter?.full_name ?? null,
    transferredByName: row.transferrer?.full_name ?? null,
    transferredAt: row.transferred_at,
    summarySentAt: row.summary_sent_at,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, employee_id, period_month, period_year, amount, bank_name, bank_account_number, bank_account_holder, note, status, transferred_at, summary_sent_at, created_at, employee:employee_id(full_name), branch:branch_id(name), submitter:submitted_by(full_name), transferrer:transferred_by(full_name)";

/** History for the current session -- RLS scopes it to own branch / self / salary_input.transfer holders. */
export async function listSalarySubmissions(supabase: TypedSupabaseClient, limit = 50): Promise<SalarySubmission[]> {
  const { data, error } = await supabase
    .from("employee_salary_submissions")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawRow[]).map(mapRow);
}

/** Everything still waiting on a transfer -- for the Super Admin/Finance queue. */
export async function listPendingSalaryTransfers(supabase: TypedSupabaseClient): Promise<SalarySubmission[]> {
  const { data, error } = await supabase
    .from("employee_salary_submissions")
    .select(SELECT)
    .eq("status", "pending_transfer")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as RawRow[]).map(mapRow);
}

/** Submitted but not yet folded into a "Kirim Ringkasan" WhatsApp message to Super Admin -- powers the send-summary button's count/preview for one branch. */
export async function listUnsummarizedSalarySubmissions(supabase: TypedSupabaseClient, branchId: string): Promise<SalarySubmission[]> {
  const { data, error } = await supabase
    .from("employee_salary_submissions")
    .select(SELECT)
    .eq("branch_id", branchId)
    .eq("status", "pending_transfer")
    .is("summary_sent_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as unknown as RawRow[]).map(mapRow);
}
