import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Markom employees are identified by Division, never by Role -- same rule
 * as Sales (see crm.repository.ts). Role is authorization only.
 */
export const MARKOM_DIVISION_NAME = "Marketing & Komunikasi";

/** Active Markom employees in a branch, for the "assign checklist to" dropdown. */
export async function listMarkomEmployees(supabase: TypedSupabaseClient, branchId: string) {
  const { data, error } = await supabase
    .from("v_employee_directory")
    .select("id, full_name, avatar_url")
    .eq("branch_id", branchId)
    .eq("division_name", MARKOM_DIVISION_NAME)
    .eq("employment_status", "active")
    .is("deleted_at", null)
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export interface KpiTaskListFilters {
  assignedTo?: string;
  branchId?: string;
  periodYear: number;
  periodMonth: number;
  periodWeek?: number;
  status?: "pending" | "completed" | "rejected";
}

/** Checklist rows for a given scope, newest first. RLS enforces who can see what. */
export async function listKpiTasks(supabase: TypedSupabaseClient, filters: KpiTaskListFilters) {
  let query = supabase
    .from("kpi_tasks")
    .select(
      "*, assignee:employees!kpi_tasks_assigned_to_fkey(full_name), verifier:employees!kpi_tasks_verified_by_fkey(full_name)",
    )
    .eq("period_year", filters.periodYear)
    .eq("period_month", filters.periodMonth)
    .order("period_week", { ascending: true })
    .order("created_at", { ascending: false });

  if (filters.assignedTo) query = query.eq("assigned_to", filters.assignedTo);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.periodWeek) query = query.eq("period_week", filters.periodWeek);
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
