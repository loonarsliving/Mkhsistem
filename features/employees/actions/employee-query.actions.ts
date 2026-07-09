"use server";

import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listEmployees, listRoles, searchEmployees, type EmployeeListFilters } from "@/repositories/employee.repository";

export async function searchEmployeesAction(term: string) {
  await requireSession();
  if (term.trim().length < 2) return [];
  const supabase = await createClient();
  return searchEmployees(supabase, term.trim());
}

export async function listEmployeesAction(filters: EmployeeListFilters) {
  const session = await requireSession();
  const supabase = await createClient();

  const scoped = { ...filters };
  if (!hasPermission(session, "employee.view_all")) {
    scoped.branchId = session.employee.branch_id;
  }

  return listEmployees(supabase, scoped);
}

export async function listRolesAction() {
  await requireSession();
  const supabase = await createClient();
  return listRoles(supabase);
}
