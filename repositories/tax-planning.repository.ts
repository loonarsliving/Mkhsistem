import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { FiscalConfig, TaxComputationResult } from "@/lib/tax-planning/calculator";

/** Reads for the Tax Planning module. Every write goes through features/tax-planning/actions instead of a direct table write (see migration 0252 -- RLS grants select-only to authenticated). */

export interface TaxPlanningAnalysisSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "ready" | "failed";
  computedResult: TaxComputationResult | null;
  narrative: string | null;
  errorDetail: string | null;
  requestedByName: string | null;
  createdAt: string;
}

export interface TaxPlanningProposal {
  id: string;
  analysisId: string;
  strategyKey: string;
  title: string;
  description: string;
  estimatedImpactIdr: number | null;
  confidence: "tinggi" | "sedang" | "rendah";
  requiresProfessionalReview: boolean;
  status: "proposed" | "accepted" | "rejected" | "needs_review";
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export async function listRecentTaxPlanningAnalyses(supabase: TypedSupabaseClient, limit = 10): Promise<TaxPlanningAnalysisSummary[]> {
  const { data, error } = await supabase
    .from("tax_planning_analyses")
    .select("id, period_start, period_end, status, computed_result, narrative, error_detail, created_at, requested_by:employees!tax_planning_analyses_requested_by_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    computedResult: (row.computed_result as unknown as TaxComputationResult) ?? null,
    narrative: row.narrative,
    errorDetail: row.error_detail,
    requestedByName: (row.requested_by as unknown as { full_name: string } | null)?.full_name ?? null,
    createdAt: row.created_at,
  }));
}

export async function getTaxPlanningAnalysis(supabase: TypedSupabaseClient, analysisId: string): Promise<TaxPlanningAnalysisSummary | null> {
  const { data, error } = await supabase
    .from("tax_planning_analyses")
    .select("id, period_start, period_end, status, computed_result, narrative, error_detail, created_at, requested_by:employees!tax_planning_analyses_requested_by_fkey(full_name)")
    .eq("id", analysisId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    status: data.status,
    computedResult: (data.computed_result as unknown as TaxComputationResult) ?? null,
    narrative: data.narrative,
    errorDetail: data.error_detail,
    requestedByName: (data.requested_by as unknown as { full_name: string } | null)?.full_name ?? null,
    createdAt: data.created_at,
  };
}

export async function listProposalsForAnalysis(supabase: TypedSupabaseClient, analysisId: string): Promise<TaxPlanningProposal[]> {
  const { data, error } = await supabase
    .from("tax_planning_proposals")
    .select(
      "id, analysis_id, strategy_key, title, description, estimated_impact_idr, confidence, requires_professional_review, status, decided_at, decision_note, created_at, decided_by:employees!tax_planning_proposals_decided_by_fkey(full_name)",
    )
    .eq("analysis_id", analysisId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    analysisId: row.analysis_id,
    strategyKey: row.strategy_key,
    title: row.title,
    description: row.description,
    estimatedImpactIdr: row.estimated_impact_idr,
    confidence: row.confidence,
    requiresProfessionalReview: row.requires_professional_review,
    status: row.status,
    decidedByName: (row.decided_by as unknown as { full_name: string } | null)?.full_name ?? null,
    decidedAt: row.decided_at,
    decisionNote: row.decision_note,
    createdAt: row.created_at,
  }));
}

export async function getFiscalConfig(supabase: TypedSupabaseClient): Promise<FiscalConfig> {
  const { data, error } = await supabase.from("tax_planning_fiscal_config").select("*").eq("id", "default").single();
  if (error) throw error;

  return {
    fiscalLossCarryforwardIdr: Number(data.fiscal_loss_carryforward_idr),
    umkmFinalTaxFirstEligibleYear: data.umkm_final_tax_first_eligible_year,
    umkmFinalTaxYearsUsed: data.umkm_final_tax_years_used,
    annualTurnoverThresholdIdr: Number(data.annual_turnover_threshold_idr),
  };
}
