import type { TypedSupabaseClient } from "@/lib/supabase/types";

export interface BranchBalance {
  branch_id: string;
  branch_name: string;
  saldo: number;
  synced_at: string;
}

export async function getBranchBalance(supabase: TypedSupabaseClient, branchId: string): Promise<BranchBalance | null> {
  const { data, error } = await supabase
    .from("finance_branch_balances")
    .select("branch_id, branch_name, saldo, synced_at")
    .eq("branch_id", branchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listBranchBalances(supabase: TypedSupabaseClient): Promise<BranchBalance[]> {
  const { data, error } = await supabase
    .from("finance_branch_balances")
    .select("branch_id, branch_name, saldo, synced_at")
    .order("branch_name");
  if (error) throw error;
  return data ?? [];
}
