import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export async function listPositions(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase.from("positions").select("*").is("deleted_at", null).order("level");
  if (error) throw error;
  return data ?? [];
}

export async function createPosition(supabase: TypedSupabaseClient, input: TablesInsert<"positions">) {
  const { error } = await supabase.from("positions").insert(input);
  if (error) throw error;
}

export async function updatePosition(supabase: TypedSupabaseClient, id: string, input: TablesUpdate<"positions">) {
  const { error } = await supabase.from("positions").update(input).eq("id", id);
  if (error) throw error;
}

export async function deletePosition(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("positions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
