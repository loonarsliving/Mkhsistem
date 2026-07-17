import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for the Loonars Dashboard / MKH Property Supabase
 * project (gluoioiimapyhchdasfl) -- a separate project from MK Connect's
 * own database, so this can't reuse createAdminClient(). Read-only usage
 * only (see repositories/loonars-dashboard-sync.repository.ts): bypasses
 * that project's RLS, so never expose this client or raw result rows
 * beyond loonars_beauty.view-gated Server Actions.
 *
 * Returns null (not a throw) when the two env vars aren't set yet, so the
 * Loonars Beauty module degrades to a "belum terhubung" state instead of
 * crashing pages that don't strictly require live sync.
 */
export function createLoonarsDashboardClient() {
  const url = process.env.LOONARS_DASHBOARD_SUPABASE_URL;
  const serviceRoleKey = process.env.LOONARS_DASHBOARD_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function isLoonarsDashboardConfigured(): boolean {
  return Boolean(process.env.LOONARS_DASHBOARD_SUPABASE_URL && process.env.LOONARS_DASHBOARD_SERVICE_ROLE_KEY);
}
