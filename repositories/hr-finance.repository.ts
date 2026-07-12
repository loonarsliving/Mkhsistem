import type { TypedSupabaseClient } from "@/lib/supabase/types";

export async function listPendingHrExpenses(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("hr_expenses")
    .select("*, employee:employee_id(full_name, employee_code), branch:branch_id(name)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listDraftPayrollRuns(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("payroll_runs")
    .select("*, branch:branch_id(name)")
    .eq("status", "draft")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listActiveEmployees(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_code, full_name, branch_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("full_name");
  if (error) throw error;
  return data ?? [];
}

export async function listBranches(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("branches").select("id, name").eq("is_active", true).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listRecentSyncLog(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("sync_log")
    .select("id, direction, event_type, status, attempt_count, last_error, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}
