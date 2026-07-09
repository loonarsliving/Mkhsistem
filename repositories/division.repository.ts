import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export async function listDivisions(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("divisions")
    .select("*, branches:branch_id(name)")
    .is("deleted_at", null)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createDivision(supabase: TypedSupabaseClient, input: TablesInsert<"divisions">) {
  const { error } = await supabase.from("divisions").insert(input);
  if (error) throw error;
}

export async function updateDivision(supabase: TypedSupabaseClient, id: string, input: TablesUpdate<"divisions">) {
  const { error } = await supabase.from("divisions").update(input).eq("id", id);
  if (error) throw error;
}

export async function deleteDivision(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("divisions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
