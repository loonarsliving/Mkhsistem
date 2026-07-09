import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export interface EmployeeListFilters {
  search?: string;
  branchId?: string;
  divisionId?: string;
  positionId?: string;
  employmentStatus?: string;
  page?: number;
  pageSize?: number;
}

export async function listEmployees(supabase: TypedSupabaseClient, filters: EmployeeListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("v_employee_directory")
    .select("*", { count: "exact" })
    .is("deleted_at", null)
    .order("full_name")
    .range(from, to);

  if (filters.search) query = query.or(`full_name.ilike.%${filters.search}%,employee_code.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.divisionId) query = query.eq("division_id", filters.divisionId);
  if (filters.positionId) query = query.eq("position_id", filters.positionId);
  if (filters.employmentStatus) query = query.eq("employment_status", filters.employmentStatus);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function searchEmployees(supabase: TypedSupabaseClient, term: string, limit = 10) {
  const { data, error } = await supabase
    .from("v_employee_directory")
    .select("id, full_name, employee_code, avatar_url")
    .is("deleted_at", null)
    .or(`full_name.ilike.%${term}%,employee_code.ilike.%${term}%`)
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getEmployeeById(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase.from("v_employee_directory").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function updateEmployee(supabase: TypedSupabaseClient, id: string, input: TablesUpdate<"employees">) {
  const { error } = await supabase.from("employees").update(input).eq("id", id);
  if (error) throw error;
}

export async function insertEmployeeProfile(supabase: TypedSupabaseClient, input: TablesInsert<"employees">) {
  const { error } = await supabase.from("employees").insert(input);
  if (error) throw error;
}

export async function softDeleteEmployee(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase
    .from("employees")
    .update({ deleted_at: new Date().toISOString(), employment_status: "terminated" })
    .eq("id", id);
  if (error) throw error;
}

export async function listRoles(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("roles").select("*").order("level");
  if (error) throw error;
  return data ?? [];
}
