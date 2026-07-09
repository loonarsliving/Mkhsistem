import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { PermissionKey, RoleKey } from "@/constants/rbac";
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

  const permissions = (rolePermissions ?? [])
    .map((row) => (row.permissions as { key: string } | null)?.key)
    .filter((key): key is string => Boolean(key)) as PermissionKey[];

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
