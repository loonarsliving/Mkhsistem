import type { TypedSupabaseClient } from "@/lib/supabase/types";

export type BranchSituationType = "cash_low" | "no_project" | "no_sales";

export interface BranchBalance {
  branch_id: string;
  branch_name: string;
  saldo: number;
  synced_at: string;
  alert_threshold: number;
  notify_dirops: boolean;
  situation_type: BranchSituationType;
  situation_note: string | null;
}

const SELECT_COLUMNS = "branch_id, branch_name, saldo, synced_at, alert_threshold, notify_dirops, situation_type, situation_note";

export async function getBranchBalance(supabase: TypedSupabaseClient, branchId: string): Promise<BranchBalance | null> {
  const { data, error } = await supabase
    .from("finance_branch_balances")
    .select(SELECT_COLUMNS)
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error) throw error;
  return data as BranchBalance | null;
}

export async function listBranchBalances(supabase: TypedSupabaseClient): Promise<BranchBalance[]> {
  const { data, error } = await supabase.from("finance_branch_balances").select(SELECT_COLUMNS).order("branch_name");
  if (error) throw error;
  return (data ?? []) as BranchBalance[];
}
