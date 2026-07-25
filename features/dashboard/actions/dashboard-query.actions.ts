"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getCompanyAttendanceSummary } from "@/repositories/attendance.repository";
import { getBranchBalance, listBranchBalances } from "@/repositories/finance-branch-balance.repository";

export async function companyAttendanceSummaryAction() {
  await requireSession();
  const supabase = await createClient();
  return getCompanyAttendanceSummary(supabase);
}

export async function branchBalanceAction(branchId: string) {
  await requireSession();
  const supabase = await createClient();
  return getBranchBalance(supabase, branchId);
}

export async function allBranchBalancesAction() {
  await requireSession();
  const supabase = await createClient();
  return listBranchBalances(supabase);
}
