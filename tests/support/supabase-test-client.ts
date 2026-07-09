import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database.types";

/**
 * Integration-test helper: creates real Supabase clients against the live
 * project (no mocking) so these tests exercise actual RLS policies and RPC
 * functions. Requires network access to *.supabase.co, which the sandboxed
 * dev container this project was built in does not have — these tests run
 * in CI (GitHub Actions), not locally in that container. See
 * tests/integration/README.md.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Integration tests need live Supabase credentials — see tests/integration/README.md.`,
    );
  }
  return value;
}

export function getSupabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function anonClient(): SupabaseClient<Database> {
  return createClient<Database>(getSupabaseUrl(), requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export type TestRole = "staff" | "hr";

const CREDENTIALS: Record<TestRole, { email: () => string; password: () => string }> = {
  staff: { email: () => requireEnv("TEST_STAFF_EMAIL"), password: () => requireEnv("TEST_STAFF_PASSWORD") },
  hr: { email: () => requireEnv("TEST_HR_EMAIL"), password: () => requireEnv("TEST_HR_PASSWORD") },
};

/** Signs in as one of the seeded low-privilege test employees and returns an authenticated client + user id. */
export async function signInAs(role: TestRole): Promise<{ client: SupabaseClient<Database>; userId: string }> {
  const client = anonClient();
  const { email, password } = CREDENTIALS[role];
  const { data, error } = await client.auth.signInWithPassword({ email: email(), password: password() });
  if (error || !data.user) {
    throw new Error(`Failed to sign in as test ${role}: ${error?.message}`);
  }
  return { client, userId: data.user.id };
}
