import type { TypedSupabaseClient } from "@/lib/supabase/types";

export async function insertDailyDigest(supabase: TypedSupabaseClient, digestText: string, model: string) {
  const { error } = await supabase.from("voice_bridge_daily_digests").insert({ digest_text: digestText, model });
  if (error) throw error;
}

export async function getLatestDailyDigest(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("voice_bridge_daily_digests")
    .select("digest_text, generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
