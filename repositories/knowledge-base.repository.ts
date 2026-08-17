import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

/** Full knowledge_base list (active + inactive) for the admin table, with project name joined in -- feeds the WhatsApp nurture bot (lib/ai/domains/lead-nurture.ts). */
export async function listKnowledgeBaseAdmin(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("knowledge_base")
    .select("*, project:project_id(name)")
    .order("project_id")
    .order("kategori")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createKnowledgeBase(
  supabase: TypedSupabaseClient,
  input: TablesInsert<"knowledge_base">,
) {
  const { error } = await supabase.from("knowledge_base").insert(input);
  if (error) throw error;
}

export async function updateKnowledgeBase(
  supabase: TypedSupabaseClient,
  id: string,
  input: TablesUpdate<"knowledge_base">,
) {
  const { error } = await supabase.from("knowledge_base").update(input).eq("id", id);
  if (error) throw error;
}

export async function setKnowledgeBaseActive(
  supabase: TypedSupabaseClient,
  id: string,
  isActive: boolean,
  updatedBy: string,
) {
  const { error } = await supabase
    .from("knowledge_base")
    .update({ is_active: isActive, updated_by: updatedBy })
    .eq("id", id);
  if (error) throw error;
}
