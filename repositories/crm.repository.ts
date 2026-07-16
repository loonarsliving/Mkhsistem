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

/** Every active project (for the photo-upload / ad-creative project picker), branch-scoped for Kepala Cabang-level Markom. */
export async function listActiveCrmProjects(supabase: TypedSupabaseClient, branchId?: string) {
  let query = supabase.from("crm_projects").select("id, name, city, branch_id, product_description").eq("is_active", true).order("name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Markom sets this once per project from the Photo Gallery screen -- price/specs/USP grounding for the AI ad-drafting pipeline (see lib/ai/domains/markom.ts's researchAndDraftAd). */
export async function updateProjectProductDescription(supabase: TypedSupabaseClient, projectId: string, productDescription: string, updatedBy: string) {
  const { error } = await supabase
    .from("crm_projects")
    .update({ product_description: productDescription || null, updated_by: updatedBy })
    .eq("id", projectId);
  if (error) throw error;
}

/** All non-deleted photos across projects, newest first, with the project name joined in -- the gallery Markom uploads to and the AI ads pipeline picks from. */
export async function listProjectPhotos(supabase: TypedSupabaseClient, projectId?: string) {
  let query = supabase
    .from("crm_project_photos")
    .select("id, project_id, storage_path, public_url, caption, uploaded_by, created_at, project:project_id(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createProjectPhoto(supabase: TypedSupabaseClient, input: TablesInsert<"crm_project_photos">) {
  const { error } = await supabase.from("crm_project_photos").insert(input);
  if (error) throw error;
}

export async function deleteProjectPhoto(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("crm_project_photos").update({ deleted_at: new Date().toISOString() }).eq("id", id);
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

/** Active product catalog for the Target form's product picker (+ inactive too, when includeInactive is true, for the Manage Products admin list). */
export async function listProducts(supabase: TypedSupabaseClient, includeInactive = false) {
  let query = supabase.from("crm_products").select("*").order("category").order("product_name");
  if (!includeInactive) query = query.eq("status", "active");
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * One row per branch for the Target Management admin page: every branch,
 * whether a target header exists for this period, and the product count /
 * total units / total revenue rolled up across that header's
 * crm_target_details (Target Management V2 -- one branch can have many
 * products, so this is a sum across all of them, not a single value).
 */
export async function listTargetHeadersSummary(supabase: TypedSupabaseClient, month: number, year: number) {
  const [branchesRes, headersRes] = await Promise.all([
    supabase.from("branches").select("id, name").is("deleted_at", null).eq("is_active", true).order("name"),
    supabase
      .from("crm_target_headers")
      .select("id, branch_id, crm_target_details(target_unit, target_revenue)")
      .eq("period_month", month)
      .eq("period_year", year),
  ]);
  if (branchesRes.error) throw branchesRes.error;
  if (headersRes.error) throw headersRes.error;

  const headerByBranch = new Map(headersRes.data.map((h) => [h.branch_id, h]));

  return branchesRes.data.map((b) => {
    const header = headerByBranch.get(b.id);
    const details = header?.crm_target_details ?? [];
    return {
      branch_id: b.id,
      branch_name: b.name,
      header_id: header?.id ?? null,
      has_target: Boolean(header),
      product_count: details.length,
      total_target_units: details.reduce((sum, d) => sum + d.target_unit, 0),
      total_target_revenue: details.reduce((sum, d) => sum + Number(d.target_revenue ?? 0), 0),
    };
  });
}

/** Existing header + one row per product (joined to the product catalog) for the Target form's edit/load state. */
export async function getTargetHeaderDetail(supabase: TypedSupabaseClient, branchId: string, month: number, year: number) {
  const { data, error } = await supabase
    .from("crm_target_headers")
    .select("id, branch_id, period_month, period_year, crm_target_details(id, product_id, target_unit, selling_price, commission_percent, target_revenue, crm_products(id, product_name, category, unit, default_price, default_commission))")
    .eq("branch_id", branchId)
    .eq("period_month", month)
    .eq("period_year", year)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Sales reps (Marketing & Sales division) currently assigned to a product -- and the branch's full Sales roster, for the assignment dialog's checklist. */
export async function listProductSalesAssignments(supabase: TypedSupabaseClient, productId: string) {
  const { data, error } = await supabase
    .from("crm_product_sales_assignments")
    .select("sales_id")
    .eq("product_id", productId);
  if (error) throw error;
  return (data ?? []).map((r) => r.sales_id);
}

/** Every active Marketing & Sales employee, optionally scoped to one branch -- the roster the assignment dialog picks from. */
export async function listSalesEmployeesForAssignment(supabase: TypedSupabaseClient, branchId?: string) {
  let query = supabase
    .from("v_employee_directory")
    .select("id, full_name, employee_code, branch_id, branch_name")
    .eq("division_name", SALES_DIVISION_NAME)
    .eq("employment_status", "active")
    .is("deleted_at", null)
    .order("full_name");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
