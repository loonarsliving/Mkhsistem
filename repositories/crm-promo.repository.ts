import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert, TablesUpdate } from "@/types/database.types";

export async function listPromoTemplates(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("crm_promo_templates")
    .select("*, branch:branch_id(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPromoTemplate(supabase: TypedSupabaseClient, input: TablesInsert<"crm_promo_templates">) {
  const { error } = await supabase.from("crm_promo_templates").insert(input);
  if (error) throw error;
}

export async function updatePromoTemplate(supabase: TypedSupabaseClient, id: string, input: TablesUpdate<"crm_promo_templates">) {
  const { error } = await supabase.from("crm_promo_templates").update(input).eq("id", id);
  if (error) throw error;
}

export async function setPromoTemplateActive(supabase: TypedSupabaseClient, id: string, isActive: boolean, updatedBy: string) {
  const { error } = await supabase
    .from("crm_promo_templates")
    .update({ is_active: isActive, updated_by: updatedBy })
    .eq("id", id);
  if (error) throw error;
}

export async function deletePromoTemplate(supabase: TypedSupabaseClient, id: string, updatedBy: string) {
  const { error } = await supabase
    .from("crm_promo_templates")
    .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("id", id);
  if (error) throw error;
}

/** Send history for one template -- lets Markom see how many actually went out vs. are still queued/failed. */
export async function listPromoSends(supabase: TypedSupabaseClient, templateId: string, limit = 50) {
  const { data, error } = await supabase
    .from("crm_promo_sends")
    .select("*, prospect:prospect_id(customer_name, city)")
    .eq("template_id", templateId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function countPromoSendsByStatus(supabase: TypedSupabaseClient, templateId: string) {
  const { data, error } = await supabase.from("crm_promo_sends").select("status").eq("template_id", templateId);
  if (error) throw error;
  const counts = { queued: 0, sent: 0, failed: 0 };
  for (const row of data ?? []) {
    counts[row.status as keyof typeof counts] += 1;
  }
  return counts;
}
