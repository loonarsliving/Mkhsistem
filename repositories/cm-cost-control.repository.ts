import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Reads for Construction Management's cost control (0215/0218). Pure aggregation, no writes. */

export interface ProjectCostControl {
  budget: number;
  boqCommitted: number;
  laborCommitted: number;
  actualTotal: number;
  actualMaterial: number;
  actualLabor: number;
  actualOther: number;
  progressPct: number;
  costPct: number | null;
  status: "unknown" | "cost_ahead" | "good" | "balanced";
}

export async function getProjectCostControl(supabase: TypedSupabaseClient, projectId: string): Promise<ProjectCostControl | null> {
  const { data, error } = await supabase.rpc("cm_project_cost_control", { p_project_id: projectId });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    budget: Number(row.budget),
    boqCommitted: Number(row.boq_committed),
    laborCommitted: Number(row.labor_committed),
    actualTotal: Number(row.actual_total),
    actualMaterial: Number(row.actual_material),
    actualLabor: Number(row.actual_labor),
    actualOther: Number(row.actual_other),
    progressPct: Number(row.progress_pct),
    costPct: row.cost_pct === null ? null : Number(row.cost_pct),
    status: row.cost_vs_progress_status,
  };
}
