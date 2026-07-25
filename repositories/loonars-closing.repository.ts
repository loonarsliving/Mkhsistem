import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Loonars-sales closings waiting for Finance to check whether the money actually landed. */
export async function listPendingLoonarsClosings(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("loonars_closings")
    .select("*")
    .eq("status", "pending_verification")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** A sales rep's own closings: still pending, verified-but-not-yet-claimed, or already claimed -- for the dashboard fee card. */
export async function listMyLoonarsClosings(supabase: TypedSupabaseClient, employeeId: string) {
  const { data, error } = await supabase
    .from("loonars_closings")
    .select("*")
    .eq("matched_employee_id", employeeId)
    .neq("status", "rejected")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
