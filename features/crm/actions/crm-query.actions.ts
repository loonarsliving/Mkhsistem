"use server";

import { hasPermission, requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import {
  getProspectById,
  listBranchSalesTargets,
  listCrmProjectsAdmin,
  listFollowUps,
  listPayments,
  listPendingPayments,
  listProspects,
  type ProspectListFilters,
} from "@/repositories/crm.repository";

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

export async function listPendingPaymentsAction() {
  await requireSession();
  const supabase = await createClient();
  return listPendingPayments(supabase);
}

export async function listBranchSalesTargetsAction(month: number, year: number) {
  const session = await requireSession();
  if (
    !hasPermission(session, "sales_target.manage") &&
    !hasPermission(session, "sales_target.view_all") &&
    !hasPermission(session, "sales_target.view_branch")
  ) {
    throw new Error("Insufficient permission");
  }
  const supabase = await createClient();
  const rows = await listBranchSalesTargets(supabase, month, year);
  if (hasPermission(session, "sales_target.view_all") || hasPermission(session, "sales_target.manage")) return rows;
  return rows.filter((r) => r.branch_id === session.employee.branch_id);
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
