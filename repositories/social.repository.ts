import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert } from "@/types/database.types";

export type CompetitorFocus = "leasehold_sales" | "occupancy" | "beauty";

export async function listCompetitorAccounts(supabase: TypedSupabaseClient, focus: CompetitorFocus) {
  const { data, error } = await supabase
    .from("social_competitor_accounts")
    .select("*")
    .eq("is_active", true)
    .eq("content_focus", focus)
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

export async function countActiveCompetitors(supabase: TypedSupabaseClient, focus: CompetitorFocus): Promise<number> {
  const { count, error } = await supabase
    .from("social_competitor_accounts")
    .select("id", { count: "exact", head: true })
    .eq("content_focus", focus)
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

/**
 * AI-discovered competitors (0125) -- inserted with source='ai_discovered',
 * skipping any handle (case-insensitive, any focus/platform) that's already
 * registered so a rediscovery run never creates a duplicate of a
 * manually-added or previously-discovered competitor.
 */
export async function insertDiscoveredCompetitors(
  supabase: TypedSupabaseClient,
  focus: CompetitorFocus,
  discovered: { platform: "instagram" | "tiktok"; handle: string; displayName: string | null; notes: string | null }[],
): Promise<number> {
  if (discovered.length === 0) return 0;

  const { data: existing, error: existingError } = await supabase.from("social_competitor_accounts").select("platform, handle");
  if (existingError) throw existingError;
  const existingKeys = new Set((existing ?? []).map((e) => `${e.platform}:${e.handle.toLowerCase()}`));

  const toInsert = discovered.filter((d) => !existingKeys.has(`${d.platform}:${d.handle.toLowerCase()}`));
  if (toInsert.length === 0) return 0;

  const { error } = await supabase.from("social_competitor_accounts").insert(
    toInsert.map((d) => ({
      platform: d.platform,
      handle: d.handle,
      display_name: d.displayName,
      notes: d.notes,
      content_focus: focus,
      source: "ai_discovered" as const,
    })),
  );
  if (error) throw error;
  return toInsert.length;
}

export async function listCompetitorContentLogs(supabase: TypedSupabaseClient, focus: CompetitorFocus, competitorAccountId?: string, limit = 30) {
  let query = supabase
    .from("social_competitor_content_logs")
    .select("*, competitor:competitor_account_id!inner(platform, handle, display_name, content_focus)")
    .eq("competitor.content_focus", focus)
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

export async function listRecentAccountSnapshots(
  supabase: TypedSupabaseClient,
  platform: "instagram" | "tiktok",
  limit = 1,
  productLine: "property" | "beauty" = "property",
) {
  const { data, error } = await supabase
    .from("social_account_snapshots")
    .select("*")
    .eq("platform", platform)
    .eq("product_line", productLine)
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
