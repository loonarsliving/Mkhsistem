import type { TypedSupabaseClient } from "@/lib/supabase/types";

export async function listAdCampaigns(supabase: TypedSupabaseClient, branchId?: string) {
  let query = supabase
    .from("meta_ad_campaigns")
    .select("*, project:project_id(name, city), branch:branch_id(name), photo:photo_id(public_url, caption)")
    .order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAdCampaign(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("meta_ad_campaigns")
    .select("*, project:project_id(name, project_type), photo:photo_id(public_url)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/**
 * RPC, not a direct table insert -- ai_job_queue's RLS (0065) has no
 * `authenticated` policy at all (every job insert elsewhere in this
 * codebase goes through a SECURITY DEFINER pg_cron function), so a plain
 * client-side insert here would silently fail. markom_request_ads_research
 * (migration 0082) is the one permission-checked entry point a human can
 * use to enqueue a research job.
 */
export async function requestAdsResearch(supabase: TypedSupabaseClient, projectId: string, branchId: string) {
  const { error } = await supabase.rpc("markom_request_ads_research", { p_project_id: projectId, p_branch_id: branchId });
  if (error) throw error;
}

export async function updateAdCampaignStatus(supabase: TypedSupabaseClient, id: string, status: "active" | "paused" | "ended") {
  const { error } = await supabase.from("meta_ad_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export interface LaunchedCampaignIds {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
}

/** Fills in a 'draft' row's Meta object IDs and flips it to 'active' once launchWhatsAppLeadCampaign succeeds. */
export async function markAdCampaignLaunched(supabase: TypedSupabaseClient, id: string, ids: LaunchedCampaignIds) {
  const { error } = await supabase
    .from("meta_ad_campaigns")
    .update({
      meta_campaign_id: ids.campaignId,
      meta_adset_id: ids.adSetId,
      meta_creative_id: ids.creativeId,
      meta_ad_id: ids.adId,
      status: "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markAdCampaignFailed(supabase: TypedSupabaseClient, id: string, reason: string) {
  const { error } = await supabase
    .from("meta_ad_campaigns")
    .update({ status: "failed", failure_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Only ever deletes rows still in 'draft' (enforced by the caller) -- a draft never had real Meta objects created, so there's nothing to clean up on Meta's side, unlike a launched campaign. */
/** Covers both 'draft' (never launched) and 'failed' (launch attempt rolled back, see deleteAdCampaign in lib/meta/ads.ts) -- both statuses are guaranteed to have no real campaign/ad set/creative/ad objects on Meta, so a DB-only delete never orphans anything server-side. Any other status is refused, since those rows do have real Meta objects that need pausing/proper handling instead of a silent delete. */
export async function deleteDraftAdCampaign(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase.from("meta_ad_campaigns").delete().eq("id", id).in("status", ["draft", "failed"]);
  if (error) throw error;
}

export interface AdCampaignAnalysisResult {
  spendIdr: number;
  impressions: number;
  clicks: number;
  conversationsStarted: number;
  aiAnalysis: string;
}

export async function saveAdCampaignAnalysis(supabase: TypedSupabaseClient, id: string, result: AdCampaignAnalysisResult) {
  const { error } = await supabase
    .from("meta_ad_campaigns")
    .update({
      spend_idr: result.spendIdr,
      impressions: result.impressions,
      clicks: result.clicks,
      conversations_started: result.conversationsStarted,
      ai_analysis: result.aiAnalysis,
      analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}
