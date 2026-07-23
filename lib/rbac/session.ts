import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JOGJA_BRANCH_ID, MANAGEMENT_PROPERTY_BRANCH_ID } from "@/constants/app";
import { MARKOM_KEPALA_CABANG_PERMISSIONS, PERMISSIONS, ROLE_KEYS, type PermissionKey, type RoleKey } from "@/constants/rbac";
import type { CurrentSession } from "@/types/domain";

/**
 * Resolves the authenticated user's employee profile, role, and permission
 * set for the current request. Memoized with React `cache()` so repeated
 * calls within one render pass share a single query. This is the single
 * source of truth server-side code should use for "who is calling and what
 * can they do" — RLS enforces the same rules at the database layer as a
 * second line of defense.
 */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: employee } = await supabase
    .from("v_employee_directory")
    .select("*")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single();

  if (!employee) return null;

  const { data: rolePermissions } = await supabase
    .from("role_permissions")
    .select("permissions(key)")
    .eq("role_id", employee.role_id);

  let permissions = (rolePermissions ?? [])
    .map((row) => (row.permissions as { key: string } | null)?.key)
    .filter((key): key is string => Boolean(key)) as PermissionKey[];

  // Kos occupancy is scoped to the Management Property branch's own Kepala
  // Cabang, not the Kepala Cabang role in general (every branch head shares
  // that role) -- see constants/app.ts.
  if (employee.branch_id === MANAGEMENT_PROPERTY_BRANCH_ID && !permissions.includes(PERMISSIONS.KOS_OCCUPANCY_VIEW)) {
    permissions.push(PERMISSIONS.KOS_OCCUPANCY_VIEW);
  }

  // Markom pages are scoped to Jogja's own Kepala Cabang -- every branch
  // shares the role, so any OTHER branch's head has these permissions
  // stripped back out here (see MARKOM_KEPALA_CABANG_PERMISSIONS). The
  // role_permissions grant itself stays untouched -- RLS already scopes
  // each Kepala Cabang to their own branch_id, so leaving it in place for
  // Jogja's head doesn't affect anyone else's data.
  if (employee.role_key === ROLE_KEYS.KEPALA_CABANG && employee.branch_id !== JOGJA_BRANCH_ID) {
    permissions = permissions.filter((key) => !(MARKOM_KEPALA_CABANG_PERMISSIONS as readonly string[]).includes(key));
  }

  return {
    userId: user.id,
    employee,
    roleKey: employee.role_key as RoleKey,
    permissions,
  };
});

/** Requires an authenticated session; redirects to /login otherwise. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

export function hasPermission(session: CurrentSession, permission: PermissionKey): boolean {
  return session.permissions.includes(permission);
}

/** Requires a specific permission; redirects to /dashboard with no throw for a smoother UX. */
export async function requirePermission(permission: PermissionKey): Promise<CurrentSession> {
  const session = await requireSession();
  if (!hasPermission(session, permission)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}
