"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listBranches } from "@/repositories/branch.repository";

export async function listBranchesAction() {
  await requireSession();
  const supabase = await createClient();
  return listBranches(supabase, true);
}
