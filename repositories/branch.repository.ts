import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export async function listBranches(supabase: TypedSupabaseClient, includeInactive = true) {
  let query = supabase.from("branches").select("*").is("deleted_at", null).order("name");
  if (!includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getBranchById(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase.from("branches").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function createBranch(supabase: TypedSupabaseClient, input: TablesInsert<"branches">) {
  const { error } = await supabase.from("branches").insert(input);
  if (error) throw error;
}

export async function updateBranch(supabase: TypedSupabaseClient, id: string, input: TablesUpdate<"branches">) {
  const { error } = await supabase.from("branches").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteBranch(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("branches").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
