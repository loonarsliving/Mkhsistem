import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { ProspectStatusDb, TablesInsert, TablesUpdate } from "@/types/database.types";

/**
 * Project Master is kept as inactive future preparation (Phase 2+) -- CRM
 * and Sales Target no longer depend on it. Only this admin-list read
 * remains, for the standalone /crm/projects management page.
 */

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
    .select("*, sales:sales_id(full_name), branch:branch_id(name)", { count: "exact" })
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
    .select("*, sales:sales_id(full_name, employee_code), branch:branch_id(name)")
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
      "*, prospect:prospect_id(customer_name, phone, branch_id, sales:sales_id(full_name))",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * One row per branch for the Branch Target admin page: every branch, the
 * target/commission Director set for this period (if any), and how many
 * currently-active Sales are in that branch (so the UI can preview "N
 * active Sales" and the ~per-Sales split before/after saving).
 */
export async function listBranchSalesTargets(supabase: TypedSupabaseClient, month: number, year: number) {
  const [branchesRes, targetsRes, salesRes] = await Promise.all([
    supabase.from("branches").select("id, name").is("deleted_at", null).eq("is_active", true).order("name"),
    supabase.from("branch_sales_targets").select("*").eq("period_month", month).eq("period_year", year),
    supabase
      .from("v_employee_directory")
      .select("id, branch_id")
      .eq("role_key", "sales")
      .eq("employment_status", "active")
      .is("deleted_at", null),
  ]);
  if (branchesRes.error) throw branchesRes.error;
  if (targetsRes.error) throw targetsRes.error;
  if (salesRes.error) throw salesRes.error;

  const targetByBranch = new Map(targetsRes.data.map((t) => [t.branch_id, t]));
  const salesCountByBranch = new Map<string, number>();
  for (const emp of salesRes.data) {
    salesCountByBranch.set(emp.branch_id, (salesCountByBranch.get(emp.branch_id) ?? 0) + 1);
  }

  return branchesRes.data.map((b) => {
    const target = targetByBranch.get(b.id);
    return {
      branch_id: b.id,
      branch_name: b.name,
      target_units: target?.target_units ?? 0,
      commission_percent: target?.commission_percent ?? 0,
      has_target: Boolean(target),
      active_sales_count: salesCountByBranch.get(b.id) ?? 0,
    };
  });
}
