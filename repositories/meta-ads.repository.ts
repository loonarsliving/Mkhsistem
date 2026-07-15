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
    .select("*, project:project_id(name), photo:photo_id(public_url)")
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
