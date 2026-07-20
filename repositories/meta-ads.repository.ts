import type { TypedSupabaseClient } from "@/lib/supabase/types";

/** Ordered full photo set (0141) -- 1 row is a plain single-image ad, 2+ is a carousel. Nested under photo:photo_id so callers get the real public_url/caption, not just the crm_project_photos id. */
const CAMPAIGN_PHOTOS_SELECT = "campaign_photos:meta_ad_campaign_photos(display_order, photo:photo_id(public_url, caption))";

export async function listAdCampaigns(supabase: TypedSupabaseClient, branchId?: string) {
  let query = supabase
    .from("meta_ad_campaigns")
    .select(`*, project:project_id(name, city), branch:branch_id(name), photo:photo_id(public_url, caption), ${CAMPAIGN_PHOTOS_SELECT}`)
    .order("created_at", { ascending: false });
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getAdCampaign(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("meta_ad_campaigns")
    .select(`*, project:project_id(name, project_type), photo:photo_id(public_url), ${CAMPAIGN_PHOTOS_SELECT}`)
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

/** Written right after a draft/launched campaign row is inserted (process-job/route.ts's processMetaAdsResearch/processMetaAdsLaunch) -- one row per photo, in the order the ad should show them. */
export async function insertAdCampaignPhotos(supabase: TypedSupabaseClient, campaignId: string, photoIds: string[]) {
  const { error } = await supabase.from("meta_ad_campaign_photos").insert(photoIds.map((photoId, index) => ({ campaign_id: campaignId, photo_id: photoId, display_order: index })));
  if (error) throw error;
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

export async function updateAdCampaignBudget(supabase: TypedSupabaseClient, id: string, dailyBudgetIdr: number) {
  const { error } = await supabase
    .from("meta_ad_campaigns")
    .update({ daily_budget_idr: dailyBudgetIdr, updated_at: new Date().toISOString() })
    .eq("id", id);
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
