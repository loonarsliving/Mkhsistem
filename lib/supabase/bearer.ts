import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { PERMISSIONS, ROLE_KEYS, type PermissionKey, type RoleKey } from "@/constants/rbac";
import type { Database } from "@/types/database.types";
import type { CurrentSession } from "@/types/domain";

/**
 * Token-scoped Supabase client for external callers (e.g. the Ultron voice
 * bridge) that authenticate with a bearer access token instead of the
 * cookie-based session `lib/supabase/server.ts` expects. Queries made with
 * this client still run through Postgres RLS as that user — it is not a
 * privilege escalation, just a different way of attaching the JWT.
 */
export function createBearerClient(accessToken: string) {
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * Resolves the calling employee's session from a bearer token, mirroring
 * `lib/rbac/session.ts#getCurrentSession` but without the cookie/redirect
 * assumptions that only make sense inside a Next.js request with a browser
 * attached.
 */
export async function getBearerSession(accessToken: string): Promise<CurrentSession | null> {
  const supabase = createBearerClient(accessToken);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(accessToken);
  if (userError || !user) return null;

  const { data: employee } = await supabase.from("v_employee_directory").select("*").eq("id", user.id).is("deleted_at", null).single();
  if (!employee) return null;

  const { data: rolePermissions } = await supabase.from("role_permissions").select("permissions(key)").eq("role_id", employee.role_id);

  const permissions = (rolePermissions ?? [])
    .map((row) => (row.permissions as { key: string } | null)?.key)
    .filter((key): key is string => Boolean(key)) as PermissionKey[];

  return {
    userId: user.id,
    employee,
    roleKey: employee.role_key as RoleKey,
    permissions,
  };
}

export function hasPermission(session: CurrentSession, permission: PermissionKey): boolean {
  return session.permissions.includes(permission);
}

/** The voice bridge is scoped to Super Admin only — see app/api/ai/voice-bridge/route.ts. */
export function isSuperAdmin(session: CurrentSession): boolean {
  return session.roleKey === ROLE_KEYS.SUPER_ADMIN;
}

export { PERMISSIONS };
