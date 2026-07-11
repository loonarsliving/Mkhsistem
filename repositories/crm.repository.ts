import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { ProspectStatusDb, TablesInsert, TablesUpdate } from "@/types/database.types";

export async function listCrmProjects(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("crm_projects")
    .select("*")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Full Project Master list (active + archived) for the admin table, with branch name joined in. */
export async function listCrmProjectsAdmin(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("crm_projects")
    .select("*, branch:branch_id(name)")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createCrmProject(supabase: TypedSupabaseClient, input: TablesInsert<"crm_projects">) {
  const { error } = await supabase.from("crm_projects").insert(input);
  if (error) throw error;
}

export async function updateCrmProject(supabase: TypedSupabaseClient, id: string, input: TablesUpdate<"crm_projects">) {
  const { error } = await supabase.from("crm_projects").update(input).eq("id", id);
  if (error) throw error;
}

export async function setCrmProjectActive(supabase: TypedSupabaseClient, id: string, isActive: boolean, updatedBy: string) {
  const { error } = await supabase
    .from("crm_projects")
    .update({ is_active: isActive, updated_by: updatedBy })
    .eq("id", id);
  if (error) throw error;
}

export interface ProspectListFilters {
  salesId?: string;
  branchId?: string;
  status?: ProspectStatusDb;
  search?: string;
  page?: number;
  pageSize?: number;
}

export async function listProspects(supabase: TypedSupabaseClient, filters: ProspectListFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("prospects")
    .select("*, sales:sales_id(full_name), project:project_id(name), branch:branch_id(name)", { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.salesId) query = query.eq("sales_id", filters.salesId);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.search) query = query.or(`customer_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function getProspectById(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("prospects")
    .select("*, sales:sales_id(full_name, employee_code), project:project_id(name), branch:branch_id(name)")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}

export async function listFollowUps(supabase: TypedSupabaseClient, prospectId: string) {
  const { data, error } = await supabase
    .from("prospect_follow_ups")
    .select("*, created_by_employee:created_by(full_name)")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPayments(supabase: TypedSupabaseClient, prospectId: string) {
  const { data, error } = await supabase
    .from("prospect_payments")
    .select(
      "*, recorded_by_employee:employees!prospect_payments_recorded_by_fkey(full_name), approved_by_employee:employees!prospect_payments_approved_by_fkey(full_name)",
    )
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listPendingPayments(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("prospect_payments")
    .select(
      "*, prospect:prospect_id(customer_name, phone, branch_id, sales:sales_id(full_name), project:project_id(name))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function listSalesEmployees(supabase: TypedSupabaseClient, branchId?: string) {
  let query = supabase
    .from("v_employee_directory")
    .select("id, full_name, employee_code, branch_id, branch_name")
    .eq("role_key", "sales")
    .is("deleted_at", null)
    .order("full_name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listSalesTargets(supabase: TypedSupabaseClient, month: number, year: number, branchId?: string) {
  const query = supabase
    .from("sales_targets")
    .select("*, sales:sales_id(full_name, branch_id)")
    .eq("period_month", month)
    .eq("period_year", year);
  const { data, error } = await query;
  if (error) throw error;
  const items = data ?? [];
  if (!branchId) return items;
  return items.filter((t) => (t.sales as unknown as { branch_id: string } | null)?.branch_id === branchId);
}
