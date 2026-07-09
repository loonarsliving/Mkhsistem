"use server";

import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { countPendingRegistrations } from "@/repositories/employee.repository";

/** Branches open for self-registration — deliberately a fixed subset, not every branch (e.g. Head Office isn't). */
const REGISTRATION_BRANCH_NAMES = ["Makassar", "Jabodetabek", "Kendari", "Jogja"] as const;
/** The "Jogja" branch is displayed as "Yogyakarta" on the registration form. */
const BRANCH_DISPLAY_NAME: Record<string, string> = { Jogja: "Yogyakarta" };

/**
 * Public (unauthenticated) lookups for the /register form. RLS blocks anon
 * reads of branches/divisions entirely, so these go through the service-role
 * client — the payload is limited to id+name, nothing sensitive.
 */
export async function listRegistrationBranchesAction() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("branches")
    .select("id, name")
    .in("name", REGISTRATION_BRANCH_NAMES)
    .is("deleted_at", null);
  if (error) throw error;

  const order = new Map(REGISTRATION_BRANCH_NAMES.map((name, i) => [name, i]));
  return (data ?? [])
    .slice()
    .sort((a, b) => (order.get(a.name as (typeof REGISTRATION_BRANCH_NAMES)[number]) ?? 0) - (order.get(b.name as (typeof REGISTRATION_BRANCH_NAMES)[number]) ?? 0))
    .map((b) => ({ id: b.id, name: BRANCH_DISPLAY_NAME[b.name] ?? b.name }));
}

export async function listRegistrationDivisionsAction() {
  const admin = createAdminClient();
  const { data, error } = await admin.from("divisions").select("id, name").is("deleted_at", null).order("name");
  if (error) throw error;
  return data ?? [];
}

/**
 * Pending registrations for the reviewer's inbox. No new RLS needed here —
 * the existing employee.view_branch / employee.view_all policies already
 * scope this correctly (a Kepala Cabang only ever sees their own branch's
 * rows, regardless of approval_status).
 */
export async function listPendingRegistrationsAction() {
  const session = await requireSession();
  if (!hasPermission(session, "registration.view_all") && !hasPermission(session, "registration.view_branch")) {
    return [];
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("id, full_name, email, phone, created_at, branches:branch_id(name), divisions:division_id(name)")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function countPendingRegistrationsAction() {
  const session = await requireSession();
  if (!hasPermission(session, "registration.view_all") && !hasPermission(session, "registration.view_branch")) {
    return 0;
  }

  const supabase = await createClient();
  return countPendingRegistrations(supabase);
}
