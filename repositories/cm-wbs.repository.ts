import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for the Construction Management module's WBS (0209). Writes happen
 * inside cm_submit_wbs_progress / cm_decide_wbs_progress / cm_seed_project_wbs
 * (all security definer), never a direct table write here.
 */

export interface ProjectWbsItem {
  id: string;
  code: string;
  name: string;
  weight: number;
  progressPct: number;
  status: "not_started" | "in_progress" | "completed";
  sortOrder: number;
}

/** WBS list for a project's overall (non-unit) breakdown, in template order. */
export async function listProjectWbs(supabase: TypedSupabaseClient, projectId: string): Promise<ProjectWbsItem[]> {
  const { data, error } = await supabase
    .from("cm_project_wbs")
    .select("id, code, name, weight, progress_pct, status, sort_order")
    .eq("project_id", projectId)
    .is("unit_id", null)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    weight: Number(row.weight),
    progressPct: Number(row.progress_pct),
    status: row.status,
    sortOrder: row.sort_order,
  }));
}

export async function getProjectOverallProgress(supabase: TypedSupabaseClient, projectId: string): Promise<number> {
  const { data, error } = await supabase.rpc("cm_project_overall_progress", { p_project_id: projectId });
  if (error) throw error;
  return Number(data ?? 0);
}

export interface WbsProgressLogItem {
  id: string;
  projectWbsId: string;
  wbsName: string;
  progressPct: number;
  photoUrl: string | null;
  note: string | null;
  submittedByName: string | null;
  submittedAt: string;
}

/** Every pending (submitted, not yet decided) progress log across projects -- for Super Admin/Finance to approve/reject. */
export async function listPendingWbsProgressLogs(supabase: TypedSupabaseClient): Promise<WbsProgressLogItem[]> {
  const { data, error } = await supabase
    .from("cm_wbs_progress_log")
    .select("id, project_wbs_id, progress_pct, photo_url, note, submitted_at, wbs:project_wbs_id(name), submitter:submitted_by(full_name)")
    .eq("status", "submitted")
    .order("submitted_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    projectWbsId: row.project_wbs_id,
    wbsName: (row.wbs as unknown as { name: string } | null)?.name ?? "-",
    progressPct: Number(row.progress_pct),
    photoUrl: row.photo_url,
    note: row.note,
    submittedByName: (row.submitter as unknown as { full_name: string } | null)?.full_name ?? null,
    submittedAt: row.submitted_at,
  }));
}
