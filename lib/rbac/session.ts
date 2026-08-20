import { cache } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { JOGJA_BRANCH_ID, KENDARI_BRANCH_ID, MAKASSAR_BRANCH_ID, MANAGEMENT_PROPERTY_BRANCH_ID } from "@/constants/app";
import {
  KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS,
  MARKOM_KEPALA_CABANG_PERMISSIONS,
  PERMISSIONS,
  ROLE_KEYS,
  SITEPLAN_MAKASSAR_ONLY_PERMISSIONS,
  type PermissionKey,
  type RoleKey,
} from "@/constants/rbac";
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

  if (employee.role_key === ROLE_KEYS.KEPALA_CABANG && employee.branch_id === KENDARI_BRANCH_ID) {
    // Owner's explicit call: Kendari's Kepala Cabang doesn't get the normal
    // full facility set -- reduced down to just the dashboard and the
    // construction project finance input/saldo page (see
    // KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS). This is Kendari-specific
    // and unrelated to which branches can USE Construction Management --
    // construction_finance.* is granted at the role level for every branch's
    // Kepala Cabang (see ROLE_PERMISSIONS_SEED), no strip needed for other
    // branches anymore.
    permissions = permissions.filter((key) => (KENDARI_KEPALA_CABANG_ALLOWED_PERMISSIONS as readonly string[]).includes(key));
  }

  // Native Siteplan viewer (0202/0203) is currently a Makassar-only project
  // -- every branch shares the "Kepala Cabang" and "Sales" roles, so any
  // employee in one of those roles whose branch isn't Makassar has
  // siteplan.view stripped back out here (see
  // SITEPLAN_MAKASSAR_ONLY_PERMISSIONS). Super Admin and the Direktur roles
  // are untouched -- they keep siteplan.view everywhere via their own
  // ROLE_PERMISSIONS_SEED grant, not this branch check. siteplan.manage
  // (admin CRUD) isn't touched here either -- it's Super Admin only at the
  // role_permissions level now, nothing to strip.
  if (
    (employee.role_key === ROLE_KEYS.KEPALA_CABANG || employee.role_key === ROLE_KEYS.SALES) &&
    employee.branch_id !== MAKASSAR_BRANCH_ID
  ) {
    permissions = permissions.filter((key) => !(SITEPLAN_MAKASSAR_ONLY_PERMISSIONS as readonly string[]).includes(key));
  }

  // Siteplan Loonars Villa (loonars-sales) is a Jogja-only project -- Jogja
  // branch employees get the nav link to it, and Super Admin sees it too
  // since that role spans every branch.
  if (
    (employee.branch_id === JOGJA_BRANCH_ID || employee.role_key === ROLE_KEYS.SUPER_ADMIN) &&
    !permissions.includes(PERMISSIONS.LOONARS_SALES_VIEW)
  ) {
    permissions.push(PERMISSIONS.LOONARS_SALES_VIEW);
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

/**
 * Session-cookie counterpart to lib/supabase/bearer.ts#requireSuperAdminBearer,
 * for API route handlers that must return a JSON error instead of redirecting
 * (redirect() throws, which is fine inside a page render but wrong for a
 * route handler a script/browser fetch()es directly -- e.g. the /api/debug/*
 * diagnostics). Reads the same cookie-based session middleware.ts already
 * requires these routes to have.
 */
export async function requireSuperAdminSession(): Promise<{ ok: true; session: CurrentSession } | { ok: false; status: number; error: string }> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, status: 401, error: "Not authenticated" };
  if (session.roleKey !== ROLE_KEYS.SUPER_ADMIN) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, session };
}
