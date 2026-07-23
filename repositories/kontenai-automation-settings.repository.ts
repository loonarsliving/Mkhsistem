import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Single-row toggle (id is always 'singleton') gating the whole daily KontenAI automation pipeline. */
export async function getKontenAiAutomationEnabled(supabase: TypedSupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from("kontenai_automation_settings").select("enabled").eq("id", "singleton").single();
  if (error) throw error;
  return data.enabled;
}

export async function setKontenAiAutomationEnabled(supabase: TypedSupabaseClient, enabled: boolean, updatedBy: string): Promise<void> {
  const { error } = await supabase
    .from("kontenai_automation_settings")
    .update({ enabled, updated_by: updatedBy, updated_at: new Date().toISOString() })
    .eq("id", "singleton");
  if (error) throw error;
}
