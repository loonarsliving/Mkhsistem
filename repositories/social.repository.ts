import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert } from "@/types/database.types";

export async function listCompetitorAccounts(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("social_competitor_accounts")
    .select("*")
    .eq("is_active", true)
    .order("platform")
    .order("handle");
  if (error) throw error;
  return data ?? [];
}

export async function createCompetitorAccount(supabase: TypedSupabaseClient, input: TablesInsert<"social_competitor_accounts">) {
  const { error } = await supabase.from("social_competitor_accounts").insert(input);
  if (error) throw error;
}

export async function deactivateCompetitorAccount(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("social_competitor_accounts").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

export async function listCompetitorContentLogs(supabase: TypedSupabaseClient, competitorAccountId?: string, limit = 30) {
  let query = supabase
    .from("social_competitor_content_logs")
    .select("*, competitor:competitor_account_id(platform, handle, display_name)")
    .order("logged_at", { ascending: false })
    .limit(limit);
  if (competitorAccountId) query = query.eq("competitor_account_id", competitorAccountId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createCompetitorContentLog(supabase: TypedSupabaseClient, input: TablesInsert<"social_competitor_content_logs">) {
  const { error } = await supabase.from("social_competitor_content_logs").insert(input);
  if (error) throw error;
}

export async function listRecentAccountSnapshots(supabase: TypedSupabaseClient, platform: "instagram" | "tiktok", limit = 1) {
  const { data, error } = await supabase
    .from("social_account_snapshots")
    .select("*")
    .eq("platform", platform)
    .order("captured_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function insertAccountSnapshot(supabase: TypedSupabaseClient, input: TablesInsert<"social_account_snapshots">) {
  const { error } = await supabase.from("social_account_snapshots").insert(input);
  if (error) throw error;
}

export async function getLatestWeeklyEvaluation(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("social_weekly_evaluations")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Content Audit module -- past weekly scored audits, newest first (0111). */
export async function listWeeklyEvaluations(supabase: TypedSupabaseClient, limit = 12) {
  const { data, error } = await supabase.from("social_weekly_evaluations").select("*").order("week_start", { ascending: false }).limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** Phase 2 (0124): our content vs registered leasehold competitors, newest first. */
export async function getLatestLeaseholdCompetitorComparison(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("social_leasehold_competitor_comparisons")
    .select("*")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
