import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export async function listWorkSchedules(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("work_schedules")
    .select("*, branches:branch_id(name)")
    .is("deleted_at", null)
    .order("is_default", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createWorkSchedule(supabase: TypedSupabaseClient, input: TablesInsert<"work_schedules">) {
  const { error } = await supabase.from("work_schedules").insert(input);
  if (error) throw error;
}

export async function updateWorkSchedule(
  supabase: TypedSupabaseClient,
  id: string,
  input: TablesUpdate<"work_schedules">,
) {
  const { error } = await supabase.from("work_schedules").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteWorkSchedule(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("work_schedules").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
