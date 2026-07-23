"use server";

import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import { listKpiTasks, listMarkomEmployees, type KpiTaskListFilters } from "@/repositories/markom.repository";

type TeamStatsRow = Database["public"]["Functions"]["kpi_team_stats"]["Returns"][number];
type NationalStatsRow = Database["public"]["Functions"]["kpi_national_stats"]["Returns"][number];
type RankingRow = Database["public"]["Functions"]["kpi_ranking"]["Returns"][number];

export async function listMarkomEmployeesAction(branchId?: string) {
  const session = await requireSession();
  const supabase = await createClient();
  return listMarkomEmployees(supabase, branchId ?? session.employee.branch_id);
}

export async function listKpiTasksAction(filters: KpiTaskListFilters) {
  const session = await requireSession();
  const supabase = await createClient();

  const scoped: KpiTaskListFilters = { ...filters };
  if (!hasPermission(session, "kpi_task.view_all")) {
    // Both "view my team's board" and "view my branch's board" resolve to the
    // same branch filter now -- a team IS the branch's roster for its division.
    scoped.branchId = session.employee.branch_id;
  }

  return listKpiTasks(supabase, scoped);
}

/** The one team-board function: used both by a team member ("my team") and the Branch Manager ("the team I review"). */
export async function teamStatsAction(branchId?: string, month?: number, year?: number): Promise<TeamStatsRow | null> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_team_stats", {
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
  const { data, error } = await supabase.rpc("kpi_national_stats", {
    p_month: month ?? null,
    p_year: year ?? null,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function kpiRankingAction(
  scope: "weekly" | "monthly",
  month?: number,
  year?: number,
  week?: number,
  branchId?: string,
): Promise<RankingRow[]> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_ranking", {
    p_scope: scope,
    p_month: month ?? null,
    p_year: year ?? null,
    p_week: week ?? null,
    p_branch_id: branchId ?? null,
  });
  if (error) throw error;
  return data ?? [];
}
