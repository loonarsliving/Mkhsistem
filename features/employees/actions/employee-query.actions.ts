"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listRoles, searchEmployees } from "@/repositories/employee.repository";

export async function searchEmployeesAction(term: string) {
  await requireSession();
  if (term.trim().length < 2) return [];
  const supabase = await createClient();
  return searchEmployees(supabase, term.trim());
}

export async function listRolesAction() {
  await requireSession();
  const supabase = await createClient();
  return listRoles(supabase);
}
