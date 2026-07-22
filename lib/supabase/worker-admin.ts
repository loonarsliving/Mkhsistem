import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Same service-role Supabase client as ./admin.ts, minus the `server-only`
 * import -- that guard throws unconditionally outside a Next.js build (it
 * relies on webpack/turbopack swapping in a no-op for server bundles), which
 * crashes the standalone render worker processes on boot. Only
 * scripts/render-worker.ts, scripts/render-worker-server.ts, and
 * lib/kontenai/render-job-processor.ts (which run as plain Node, never
 * inside Next.js) should import this instead of ./admin.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
