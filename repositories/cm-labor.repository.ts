import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Reads for Construction Management's labor/kontraktor module (0213). Writes are all security-definer RPCs. */

export interface Contractor {
  id: string;
  fullName: string;
  contractorType: "tukang" | "mandor" | "subcontractor";
  phone: string | null;
}

export async function listActiveContractors(supabase: TypedSupabaseClient): Promise<Contractor[]> {
  const { data, error } = await supabase.from("cm_contractors").select("id, full_name, contractor_type, phone").eq("is_active", true).order("full_name");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, fullName: row.full_name, contractorType: row.contractor_type, phone: row.phone }));
}

export interface LaborContractSummary {
  contractValue: number;
  cumulativeEarned: number;
  cumulativePaid: number;
  payable: number;
  outstandingAdvance: number;
  status: "normal" | "overpayment";
}

export interface LaborContractWithSummary {
  id: string;
  projectId: string;
  unitId: string | null;
  unitCode: string | null;
  contractorId: string;
  contractorName: string;
  contractValue: number;
  retentionPct: number;
  status: "active" | "completed" | "cancelled";
  startDate: string;
  targetCompletion: string | null;
  hasWeights: boolean;
  summary: LaborContractSummary;
}

export async function listProjectLaborContracts(supabase: TypedSupabaseClient, projectId: string): Promise<LaborContractWithSummary[]> {
  const { data, error } = await supabase
    .from("cm_labor_contracts")
    .select(
      "id, project_id, unit_id, contractor_id, contract_value, retention_pct, status, start_date, target_completion, contractor:contractor_id(full_name), unit:unit_id(code)",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const contracts = data ?? [];
  const results: LaborContractWithSummary[] = [];
  for (const c of contracts) {
    const [{ data: summaryRows, error: summaryError }, { count: weightCount, error: weightError }] = await Promise.all([
      supabase.rpc("cm_labor_contract_summary", { p_contract_id: c.id }),
      supabase.from("cm_labor_contract_weights").select("id", { count: "exact", head: true }).eq("contract_id", c.id),
    ]);
    if (summaryError) throw summaryError;
    if (weightError) throw weightError;
    const s = summaryRows?.[0];
    results.push({
      id: c.id,
      projectId: c.project_id,
      unitId: c.unit_id,
      unitCode: (c.unit as unknown as { code: string } | null)?.code ?? null,
      contractorId: c.contractor_id,
      contractorName: (c.contractor as unknown as { full_name: string } | null)?.full_name ?? "-",
      contractValue: Number(c.contract_value),
      retentionPct: Number(c.retention_pct),
      status: c.status,
      startDate: c.start_date,
      targetCompletion: c.target_completion,
      hasWeights: (weightCount ?? 0) > 0,
      summary: s
        ? {
            contractValue: Number(s.contract_value),
            cumulativeEarned: Number(s.cumulative_earned),
            cumulativePaid: Number(s.cumulative_paid),
            payable: Number(s.payable),
            outstandingAdvance: Number(s.outstanding_advance),
            status: s.status,
          }
        : { contractValue: Number(c.contract_value), cumulativeEarned: 0, cumulativePaid: 0, payable: 0, outstandingAdvance: 0, status: "normal" },
    });
  }
  return results;
}

export interface LaborPaymentItem {
  id: string;
  contractId: string;
  contractorName: string;
  unitCode: string | null;
  /** Total kontrak - sudah dibayar (approved), sebelum payment ini diputuskan -- ditampilkan supaya Kepala Cabang tahu sisa borongan unit ini sebelum menyetujui. */
  contractRemaining: number;
  periodStart: string;
  periodEnd: string;
  grossEarned: number;
  retentionAmount: number;
  deductionAmount: number;
  advanceRecoveryAmount: number;
  netPayable: number;
  status: "draft" | "kc_approved" | "approved" | "rejected";
  aiVerdict: "sesuai" | "perlu_dicek" | "tidak_sesuai" | null;
  aiSummary: string | null;
  aiConcerns: string[];
  aiPhotoCount: number;
  aiReviewedAt: string | null;
}

const LABOR_PAYMENT_SELECT =
  "id, contract_id, period_start, period_end, gross_earned, retention_amount, deduction_amount, advance_recovery_amount, net_payable, status, ai_verdict, ai_summary, ai_concerns, ai_photo_count, ai_reviewed_at, contract:contract_id(contract_value, contractor:contractor_id(full_name), unit:unit_id(code))";

interface LaborPaymentRow {
  id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  gross_earned: number;
  retention_amount: number;
  deduction_amount: number;
  advance_recovery_amount: number;
  net_payable: number;
  status: "draft" | "kc_approved" | "approved" | "rejected";
  ai_verdict: "sesuai" | "perlu_dicek" | "tidak_sesuai" | null;
  ai_summary: string | null;
  ai_concerns: string[] | null;
  ai_photo_count: number | null;
  ai_reviewed_at: string | null;
  contract: { contract_value: number; contractor: { full_name: string } | null; unit: { code: string } | null } | null;
}

async function mapLaborPaymentRows(supabase: TypedSupabaseClient, rows: LaborPaymentRow[]): Promise<LaborPaymentItem[]> {
  const results: LaborPaymentItem[] = [];
  for (const row of rows) {
    const { data: summaryRows, error } = await supabase.rpc("cm_labor_contract_summary", { p_contract_id: row.contract_id });
    if (error) throw error;
    const s = summaryRows?.[0];
    const contractValue = row.contract ? Number(row.contract.contract_value) : 0;
    const contractRemaining = s ? contractValue - Number(s.cumulative_paid) : contractValue;
    results.push({
      id: row.id,
      contractId: row.contract_id,
      contractorName: row.contract?.contractor?.full_name ?? "-",
      unitCode: row.contract?.unit?.code ?? null,
      contractRemaining,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      grossEarned: Number(row.gross_earned),
      retentionAmount: Number(row.retention_amount),
      deductionAmount: Number(row.deduction_amount),
      advanceRecoveryAmount: Number(row.advance_recovery_amount),
      netPayable: Number(row.net_payable),
      status: row.status,
      aiVerdict: row.ai_verdict,
      aiSummary: row.ai_summary,
      aiConcerns: row.ai_concerns ?? [],
      aiPhotoCount: row.ai_photo_count ?? 0,
      aiReviewedAt: row.ai_reviewed_at,
    });
  }
  return results;
}

/** Awaiting Kepala Cabang's decision (status='draft') -- RLS scopes this to the caller's own branch unless they hold construction_finance.manage. */
export async function listPaymentsAwaitingKcApproval(supabase: TypedSupabaseClient): Promise<LaborPaymentItem[]> {
  const { data, error } = await supabase.from("cm_labor_payments").select(LABOR_PAYMENT_SELECT).eq("status", "draft").order("created_at", { ascending: true });
  if (error) throw error;
  return mapLaborPaymentRows(supabase, (data ?? []) as unknown as LaborPaymentRow[]);
}

/** Forwarded by Kepala Cabang, awaiting final Super Admin/Finance approval (status='kc_approved'). */
export async function listPaymentsAwaitingFinalApproval(supabase: TypedSupabaseClient): Promise<LaborPaymentItem[]> {
  const { data, error } = await supabase
    .from("cm_labor_payments")
    .select(LABOR_PAYMENT_SELECT)
    .eq("status", "kc_approved")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return mapLaborPaymentRows(supabase, (data ?? []) as unknown as LaborPaymentRow[]);
}

export interface ProjectWbsOption {
  id: string;
  name: string;
  progressPct: number;
}

export async function listProjectWbsOptions(supabase: TypedSupabaseClient, projectId: string): Promise<ProjectWbsOption[]> {
  const { data, error } = await supabase
    .from("cm_project_wbs")
    .select("id, name, progress_pct")
    .eq("project_id", projectId)
    .is("unit_id", null)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, name: row.name, progressPct: Number(row.progress_pct) }));
}

export interface ProjectUnitOption {
  id: string;
  code: string;
}

/** For the labor contract creation dialog's unit picker -- empty for projects created before per-unit budgeting (0217), e.g. Kendari's current project. */
export async function listProjectUnits(supabase: TypedSupabaseClient, projectId: string): Promise<ProjectUnitOption[]> {
  const { data, error } = await supabase.from("cm_units").select("id, code").eq("project_id", projectId).order("code");
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id, code: row.code }));
}
