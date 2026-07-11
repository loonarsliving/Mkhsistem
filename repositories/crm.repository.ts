import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { LeadSourceDb, ProspectStatusDb, TablesInsert, TablesUpdate } from "@/types/database.types";

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

/**
 * Project is optional in the CRM drill-down (Company > Branch > Project? >
 * Sales > Customer) -- the current business is Branch-based and doesn't use
 * Project Master operationally. This checks whether any real prospect
 * actually references a project; the drill-down nav shows the Project level
 * only when this is true, so it appears automatically once real usage
 * starts instead of needing a manual toggle.
 */
export async function isProjectMasterInUse(supabase: TypedSupabaseClient) {
  const { count, error } = await supabase
    .from("prospects")
    .select("*", { count: "exact", head: true })
    .not("project_id", "is", null)
    .is("deleted_at", null);
  if (error) throw error;
  return (count ?? 0) > 0;
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
  leadSource?: LeadSourceDb;
  dateFrom?: string;
  dateTo?: string;
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
  if (filters.leadSource) query = query.eq("lead_source", filters.leadSource);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
  if (filters.search) query = query.or(`customer_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

/** All matching prospects, unpaginated, for export -- caller must already be permission-scoped. */
export async function listProspectsForExport(supabase: TypedSupabaseClient, filters: Omit<ProspectListFilters, "page" | "pageSize">) {
  let query = supabase
    .from("prospects")
    .select("*, sales:sales_id(full_name), branch:branch_id(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (filters.salesId) query = query.eq("sales_id", filters.salesId);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.leadSource) query = query.eq("lead_source", filters.leadSource);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
  if (filters.search) query = query.or(`customer_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
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

/** Recent follow-up activity across every prospect owned by one Sales -- the Sales View's Follow Up Timeline. */
export async function listRecentFollowUpsBySales(supabase: TypedSupabaseClient, salesId: string, limit = 20) {
  const { data, error } = await supabase
    .from("prospect_follow_ups")
    .select("*, prospect:prospect_id!inner(customer_name, phone, sales_id), created_by_employee:created_by(full_name)")
    .eq("prospect.sales_id", salesId)
    .order("created_at", { ascending: false })
    .limit(limit);
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
 * "Sales" is determined by Division, never by Role -- Role is authorization
 * only. Employees in this division are who target distribution counts,
 * regardless of what Role (staff, sales, ...) they happen to hold.
 */
export const SALES_DIVISION_NAME = "Marketing & Sales";

/**
 * One row per branch for the Branch Target admin page: every branch, the
 * target/commission Director set for this period (if any), and how many
 * currently-active Marketing & Sales employees are in that branch (so the
 * UI can preview "N active Sales" and the ~per-Sales split before/after
 * saving).
 */
export async function listBranchSalesTargets(supabase: TypedSupabaseClient, month: number, year: number) {
  const [branchesRes, targetsRes, salesRes] = await Promise.all([
    supabase.from("branches").select("id, name").is("deleted_at", null).eq("is_active", true).order("name"),
    supabase.from("branch_sales_targets").select("*").eq("period_month", month).eq("period_year", year),
    supabase
      .from("v_employee_directory")
      .select("id, branch_id")
      .eq("division_name", SALES_DIVISION_NAME)
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
      selling_price_per_unit: target?.selling_price_per_unit ?? 0,
      commission_percent: target?.commission_percent ?? 0,
      has_target: Boolean(target),
      active_sales_count: salesCountByBranch.get(b.id) ?? 0,
    };
  });
}
