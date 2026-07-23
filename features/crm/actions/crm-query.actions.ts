"use server";

import { hasPermission, requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import {
  getProspectById,
  getTargetHeaderDetail,
  isProjectMasterInUse,
  listCrmProjectsAdmin,
  listFollowUps,
  listPayments,
  listPendingPayments,
  listProducts,
  listProductSalesAssignments,
  listProspects,
  listProspectsForExport,
  listRecentFollowUpsBySales,
  listSalesEmployeesForAssignment,
  listTargetHeadersSummary,
  type ProspectListFilters,
} from "@/repositories/crm.repository";

/** RLS (crm_sp1_warnings_select) already scopes rows to own branch unless the caller holds sp1_warning.view_all -- this just resolves sales/branch names for display since the table only stores ids. */
export async function listSp1WarningsAction() {
  await requirePermission("sp1_warning.manage");
  const supabase = await createClient();

  const { data: warnings, error } = await supabase.from("crm_sp1_warnings").select("*").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!warnings || warnings.length === 0) return [];

  const salesIds = [...new Set(warnings.map((w) => w.sales_id))];
  const branchIds = [...new Set(warnings.map((w) => w.branch_id))];
  const [{ data: sales }, { data: branches }] = await Promise.all([
    supabase.from("employees").select("id, full_name").in("id", salesIds),
    supabase.from("branches").select("id, name").in("id", branchIds),
  ]);
  const salesById = new Map((sales ?? []).map((s) => [s.id, s.full_name]));
  const branchById = new Map((branches ?? []).map((b) => [b.id, b.name]));

  return warnings.map((w) => ({
    ...w,
    salesName: salesById.get(w.sales_id) ?? "-",
    branchName: branchById.get(w.branch_id) ?? "-",
  }));
}

/** Scopes a Customer Database / export filter set the same way listProspectsAction does, for Director-level browsing. */
function scopeProspectFilters(
  session: Awaited<ReturnType<typeof requireSession>>,
  filters: Omit<ProspectListFilters, "salesId" | "branchId"> & { salesId?: string; branchId?: string },
) {
  const scoped = { ...filters };
  if (!hasPermission(session, "prospect.view_all")) {
    if (hasPermission(session, "prospect.view_branch")) {
      scoped.branchId = session.employee.branch_id;
    } else {
      scoped.salesId = session.userId;
    }
  }
  return scoped;
}

export async function listProspectsAction(filters: ProspectListFilters) {
  const session = await requireSession();
  const supabase = await createClient();

  const scoped: ProspectListFilters = { ...filters };
  if (!hasPermission(session, "prospect.view_all")) {
    if (hasPermission(session, "prospect.view_branch")) {
      scoped.branchId = session.employee.branch_id;
    } else {
      scoped.salesId = session.userId;
    }
  }

  return listProspects(supabase, scoped);
}

export async function getProspectDetailAction(id: string) {
  await requireSession();
  const supabase = await createClient();
  const [prospect, followUps, payments] = await Promise.all([
    getProspectById(supabase, id),
    listFollowUps(supabase, id),
    listPayments(supabase, id),
  ]);
  return { prospect, followUps, payments };
}

export async function listCrmProjectsAdminAction() {
  await requirePermission("crm_project.manage");
  const supabase = await createClient();
  return listCrmProjectsAdmin(supabase);
}

/** Whether the CRM drill-down nav should show a Project level -- true only once a real prospect actually references one. */
export async function isProjectMasterInUseAction() {
  await requireSession();
  const supabase = await createClient();
  return isProjectMasterInUse(supabase);
}

export async function listPendingPaymentsAction() {
  await requireSession();
  const supabase = await createClient();
  return listPendingPayments(supabase);
}

export async function listTargetHeadersSummaryAction(month: number, year: number) {
  const session = await requireSession();
  if (
    !hasPermission(session, "sales_target.manage") &&
    !hasPermission(session, "sales_target.view_all") &&
    !hasPermission(session, "sales_target.view_branch")
  ) {
    throw new Error("Insufficient permission");
  }
  const supabase = await createClient();
  const rows = await listTargetHeadersSummary(supabase, month, year);
  if (hasPermission(session, "sales_target.view_all") || hasPermission(session, "sales_target.manage")) return rows;
  return rows.filter((r) => r.branch_id === session.employee.branch_id);
}

export async function getTargetHeaderDetailAction(branchId: string, month: number, year: number) {
  await requirePermission("sales_target.manage");
  const supabase = await createClient();
  return getTargetHeaderDetail(supabase, branchId, month, year);
}

/** Active product catalog for the Target form's product picker. */
export async function listProductsAction(includeInactive = false) {
  await requireSession();
  const supabase = await createClient();
  return listProducts(supabase, includeInactive);
}

export async function listProductSalesAssignmentsAction(productId: string) {
  await requirePermission("sales_target.manage");
  const supabase = await createClient();
  return listProductSalesAssignments(supabase, productId);
}

export async function listSalesEmployeesForAssignmentAction(branchId?: string) {
  await requirePermission("sales_target.manage");
  const supabase = await createClient();
  return listSalesEmployeesForAssignment(supabase, branchId);
}

type SalesStatsRow = Database["public"]["Functions"]["crm_sales_stats"]["Returns"][number];
type BranchStatsRow = Database["public"]["Functions"]["crm_branch_stats"]["Returns"][number];
type NationalStatsRow = Database["public"]["Functions"]["crm_national_stats"]["Returns"][number];

export async function salesStatsAction(salesId?: string, month?: number, year?: number): Promise<SalesStatsRow | null> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_sales_stats", {
    p_sales_id: salesId ?? null,
    p_month: month ?? null,
    p_year: year ?? null,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function branchStatsAction(branchId?: string, month?: number, year?: number): Promise<BranchStatsRow | null> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_branch_stats", {
    p_branch_id: branchId ?? null,
    p_month: month ?? null,
    p_year: year ?? null,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function nationalStatsAction(month?: number, year?: number): Promise<NationalStatsRow | null> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_national_stats", {
    p_month: month ?? null,
    p_year: year ?? null,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function salesRankingAction(month?: number, year?: number, branchId?: string) {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_sales_ranking", {
    p_month: month ?? null,
    p_year: year ?? null,
    p_branch_id: branchId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function conversionAnalyticsAction(branchId?: string, month?: number, year?: number) {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_conversion_analytics", {
    p_branch_id: branchId ?? null,
    p_month: month ?? null,
    p_year: year ?? null,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function monthlyTrendAction(monthsBack = 6, branchId?: string, salesId?: string) {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_monthly_trend", {
    p_months_back: monthsBack,
    p_branch_id: branchId ?? null,
    p_sales_id: salesId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}

export async function listRecentFollowUpsBySalesAction(salesId: string, limit = 20) {
  await requireSession();
  const supabase = await createClient();
  return listRecentFollowUpsBySales(supabase, salesId, limit);
}

/** Customer Database: full-filter browsing for Directors/Branch Managers/Sales, each auto-scoped to what they're allowed to see. */
export async function listCustomerDatabaseAction(filters: Omit<ProspectListFilters, "salesId" | "branchId"> & { salesId?: string; branchId?: string }) {
  const session = await requireSession();
  return listProspects(await createClient(), scopeProspectFilters(session, filters));
}

export async function exportCustomerDatabaseAction(
  filters: Omit<ProspectListFilters, "salesId" | "branchId" | "page" | "pageSize"> & { salesId?: string; branchId?: string },
) {
  const session = await requireSession();
  return listProspectsForExport(await createClient(), scopeProspectFilters(session, filters));
}
