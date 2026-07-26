import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for the HR discipline module. Every write goes through the RPCs in
 * migration 0178 instead of a table write, so the evidence snapshot and the
 * SP-ladder rule can never be bypassed from the client.
 */

export interface DisciplineEvidence {
  captured_at: string;
  alpha_30d: number;
  late_30d: number;
  alpha_90d: number;
  late_90d: number;
  active_warnings: number;
  last_warning: string | null;
}

/** What the record actually supports, straight from the same function the RPC freezes into the letter. */
export async function getDisciplineEvidence(
  supabase: TypedSupabaseClient,
  employeeId: string,
): Promise<DisciplineEvidence | null> {
  const { data, error } = await supabase.rpc("hr_discipline_evidence", { p_employee_id: employeeId });
  if (error) throw error;
  return (data as unknown as DisciplineEvidence) ?? null;
}

export interface DisciplinaryAction {
  id: string;
  employeeId: string;
  employeeName: string;
  branchName: string | null;
  actionType: string;
  reasonCategory: string;
  description: string;
  evidence: DisciplineEvidence | null;
  effectiveDate: string;
  lastWorkingDate: string | null;
  bypassedLadder: boolean;
  bypassJustification: string | null;
  status: string;
  issuedByName: string | null;
  createdAt: string;
}

interface RawRow {
  id: string;
  employee_id: string;
  action_type: string;
  reason_category: string;
  description: string;
  evidence: unknown;
  effective_date: string;
  last_working_date: string | null;
  bypassed_ladder: boolean;
  bypass_justification: string | null;
  status: string;
  created_at: string;
  employee: { full_name: string } | null;
  branch: { name: string } | null;
  issuer: { full_name: string } | null;
}

function mapRow(row: RawRow): DisciplinaryAction {
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee?.full_name ?? "—",
    branchName: row.branch?.name ?? null,
    actionType: row.action_type,
    reasonCategory: row.reason_category,
    description: row.description,
    evidence: (row.evidence as DisciplineEvidence) ?? null,
    effectiveDate: row.effective_date,
    lastWorkingDate: row.last_working_date,
    bypassedLadder: row.bypassed_ladder,
    bypassJustification: row.bypass_justification,
    status: row.status,
    issuedByName: row.issuer?.full_name ?? null,
    createdAt: row.created_at,
  };
}

const SELECT =
  "id, employee_id, action_type, reason_category, description, evidence, effective_date, last_working_date, bypassed_ladder, bypass_justification, status, created_at, employee:employee_id(full_name), branch:branch_id(name), issuer:issued_by(full_name)";

export async function listDisciplinaryActions(supabase: TypedSupabaseClient, limit = 50): Promise<DisciplinaryAction[]> {
  const { data, error } = await supabase
    .from("hr_disciplinary_actions")
    .select(SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawRow[]).map(mapRow);
}

export async function listDisciplinaryActionsForEmployee(
  supabase: TypedSupabaseClient,
  employeeId: string,
): Promise<DisciplinaryAction[]> {
  const { data, error } = await supabase
    .from("hr_disciplinary_actions")
    .select(SELECT)
    .eq("employee_id", employeeId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as RawRow[]).map(mapRow);
}

export interface DisciplineCandidate {
  id: string;
  fullName: string;
  branchName: string;
  employmentStatus: string;
}

/** Active employees, for the picker. Terminated staff are excluded -- there is nothing left to issue against them. */
export async function listDisciplineCandidates(supabase: TypedSupabaseClient): Promise<DisciplineCandidate[]> {
  const { data, error } = await supabase
    .from("v_employee_directory")
    .select("id, full_name, branch_name, employment_status")
    .eq("employment_status", "active")
    .order("full_name", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    branchName: row.branch_name ?? "—",
    employmentStatus: row.employment_status,
  }));
}
