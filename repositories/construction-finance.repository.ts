import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Reads for construction project finance (0193). Every write goes through
 * construction_submit_expense / construction_settle_expense /
 * construction_record_fund_transfer instead of a table write, so the
 * branch scoping and notification fan-out can't be bypassed from the client.
 */

export interface ConstructionProject {
  id: string;
  branchId: string;
  branchName: string | null;
  name: string;
  totalBudget: number;
  status: "active" | "completed" | "cancelled";
  danaMasuk: number;
  totalCashOut: number;
  totalUtangBelumLunas: number;
  totalUtangLunas: number;
}

/** The active construction project for a branch, with running totals -- one row expected per branch today (Kendari only). */
export async function getActiveConstructionProject(supabase: TypedSupabaseClient, branchId: string): Promise<ConstructionProject | null> {
  const { data: project, error } = await supabase
    .from("construction_projects")
    .select("id, branch_id, name, total_budget, status, branch:branch_id(name)")
    .eq("branch_id", branchId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!project) return null;

  const [{ data: transfers, error: transfersError }, { data: expenses, error: expensesError }] = await Promise.all([
    supabase.from("construction_fund_transfers").select("amount").eq("project_id", project.id),
    supabase.from("construction_expenses").select("expense_type, payment_method, amount, is_settled").eq("project_id", project.id),
  ]);
  if (transfersError) throw transfersError;
  if (expensesError) throw expensesError;

  const danaMasuk = (transfers ?? []).reduce((sum, t) => sum + Number(t.amount), 0);
  const totalCashOut = (expenses ?? []).filter((e) => e.payment_method === "cash").reduce((sum, e) => sum + Number(e.amount), 0);
  const utang = (expenses ?? []).filter((e) => e.payment_method === "utang");
  const totalUtangBelumLunas = utang.filter((e) => !e.is_settled).reduce((sum, e) => sum + Number(e.amount), 0);
  const totalUtangLunas = utang.filter((e) => e.is_settled).reduce((sum, e) => sum + Number(e.amount), 0);

  return {
    id: project.id,
    branchId: project.branch_id,
    branchName: (project.branch as unknown as { name: string } | null)?.name ?? null,
    name: project.name,
    totalBudget: Number(project.total_budget),
    status: project.status,
    danaMasuk,
    totalCashOut,
    totalUtangBelumLunas,
    totalUtangLunas,
  };
}

/** Every active construction project across branches -- for Super Admin/Finance. */
export async function listActiveConstructionProjects(supabase: TypedSupabaseClient): Promise<ConstructionProject[]> {
  const { data: projects, error } = await supabase
    .from("construction_projects")
    .select("id, branch_id, name, total_budget, status, branch:branch_id(name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;

  return Promise.all((projects ?? []).map((p) => getActiveConstructionProject(supabase, p.branch_id))).then(
    (rows) => rows.filter((r): r is ConstructionProject => r !== null),
  );
}

export interface ConstructionExpense {
  id: string;
  projectId: string;
  branchName: string | null;
  expenseType: "gaji_tukang" | "pembelian_material" | "material_tunai" | "pembelian_lain_lain" | "lain_lain_tunai";
  partyName: string;
  description: string | null;
  amount: number;
  paymentMethod: "cash" | "utang";
  isSettled: boolean;
  expenseDate: string;
  createdByName: string | null;
  createdAt: string;
}

interface RawExpenseRow {
  id: string;
  project_id: string;
  expense_type: "gaji_tukang" | "pembelian_material" | "material_tunai" | "pembelian_lain_lain" | "lain_lain_tunai";
  party_name: string;
  description: string | null;
  amount: number;
  payment_method: "cash" | "utang";
  is_settled: boolean;
  expense_date: string;
  created_at: string;
  branch: { name: string } | null;
  creator: { full_name: string } | null;
}

function mapExpenseRow(row: RawExpenseRow): ConstructionExpense {
  return {
    id: row.id,
    projectId: row.project_id,
    branchName: row.branch?.name ?? null,
    expenseType: row.expense_type,
    partyName: row.party_name,
    description: row.description,
    amount: Number(row.amount),
    paymentMethod: row.payment_method,
    isSettled: row.is_settled,
    expenseDate: row.expense_date,
    createdByName: row.creator?.full_name ?? null,
    createdAt: row.created_at,
  };
}

const EXPENSE_SELECT =
  "id, project_id, expense_type, party_name, description, amount, payment_method, is_settled, expense_date, created_at, branch:branch_id(name), creator:created_by(full_name)";

/** History for the current session -- RLS scopes it to own branch / construction_finance.manage holders. */
export async function listConstructionExpenses(supabase: TypedSupabaseClient, projectId: string, limit = 100): Promise<ConstructionExpense[]> {
  const { data, error } = await supabase
    .from("construction_expenses")
    .select(EXPENSE_SELECT)
    .eq("project_id", projectId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as unknown as RawExpenseRow[]).map(mapExpenseRow);
}

/** Every outstanding utang toko across branches -- for Super Admin/Finance to settle. */
export async function listUnsettledUtang(supabase: TypedSupabaseClient): Promise<ConstructionExpense[]> {
  const { data, error } = await supabase
    .from("construction_expenses")
    .select(EXPENSE_SELECT)
    .eq("payment_method", "utang")
    .eq("is_settled", false)
    .order("expense_date", { ascending: true });
  if (error) throw error;
  return (data as unknown as RawExpenseRow[]).map(mapExpenseRow);
}

export interface ConstructionTarget {
  id: string;
  branchId: string;
  projectName: string;
  periodMonth: number;
  periodYear: number;
  targetUnits: number;
  valuePerUnit: number;
  totalValue: number;
}

/** The current/upcoming unit-sales target for a branch (0196) -- not tied to CRM, just a standalone target row. Picks the target whose period hasn't ended yet, soonest first. */
export async function getActiveConstructionTarget(supabase: TypedSupabaseClient, branchId: string): Promise<ConstructionTarget | null> {
  const { data, error } = await supabase
    .from("construction_targets")
    .select("id, branch_id, project_name, period_month, period_year, target_units, value_per_unit")
    .eq("branch_id", branchId)
    .order("period_year", { ascending: true })
    .order("period_month", { ascending: true });
  if (error) throw error;

  const now = new Date();
  const currentPeriod = now.getFullYear() * 12 + now.getMonth();
  const target = (data ?? []).find((row) => row.period_year * 12 + (row.period_month - 1) >= currentPeriod);
  if (!target) return null;

  return {
    id: target.id,
    branchId: target.branch_id,
    projectName: target.project_name,
    periodMonth: target.period_month,
    periodYear: target.period_year,
    targetUnits: target.target_units,
    valuePerUnit: Number(target.value_per_unit),
    totalValue: target.target_units * Number(target.value_per_unit),
  };
}

export interface ConstructionProgressAssessment {
  projectCode: string;
  assessedAt: string;
  overallProgressPct: number;
  summary: string;
  concerns: string[];
  blockCount: number;
  blockCountWithPhotos: number;
  blockSnapshot: { code: string; aiStage: string | null; aiProgressPct: number | null; photoCount7d: number; lastPhotoAt: string | null }[];
}

/** Latest weekly AI overall-progress synthesis for a project (0227) -- overwritten every Saturday, not a history log. Null if no assessment has run yet. */
export async function getConstructionProgressAssessment(supabase: TypedSupabaseClient, projectCode: string): Promise<ConstructionProgressAssessment | null> {
  const { data, error } = await supabase.from("construction_progress_assessments").select("*").eq("project_code", projectCode).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return {
    projectCode: data.project_code,
    assessedAt: data.assessed_at,
    overallProgressPct: data.overall_progress_pct,
    summary: data.summary,
    concerns: data.concerns,
    blockCount: data.block_count,
    blockCountWithPhotos: data.block_count_with_photos,
    blockSnapshot: (data.block_snapshot as ConstructionProgressAssessment["blockSnapshot"]) ?? [],
  };
}
