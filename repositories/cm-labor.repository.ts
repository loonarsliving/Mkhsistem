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
    .select("id, project_id, contractor_id, contract_value, retention_pct, status, start_date, target_completion, contractor:contractor_id(full_name)")
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
  periodStart: string;
  periodEnd: string;
  grossEarned: number;
  retentionAmount: number;
  deductionAmount: number;
  advanceRecoveryAmount: number;
  netPayable: number;
  status: "draft" | "approved" | "rejected";
  aiVerdict: "sesuai" | "perlu_dicek" | "tidak_sesuai" | null;
  aiSummary: string | null;
  aiConcerns: string[];
  aiPhotoCount: number;
  aiReviewedAt: string | null;
}

export async function listPendingLaborPayments(supabase: TypedSupabaseClient): Promise<LaborPaymentItem[]> {
  const { data, error } = await supabase
    .from("cm_labor_payments")
    .select(
      "id, contract_id, period_start, period_end, gross_earned, retention_amount, deduction_amount, advance_recovery_amount, net_payable, status, ai_verdict, ai_summary, ai_concerns, ai_photo_count, ai_reviewed_at, contract:contract_id(contractor:contractor_id(full_name))",
    )
    .eq("status", "draft")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => {
    const contractor = (row.contract as unknown as { contractor: { full_name: string } | null } | null)?.contractor;
    return {
      id: row.id,
      contractId: row.contract_id,
      contractorName: contractor?.full_name ?? "-",
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
    };
  });
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
