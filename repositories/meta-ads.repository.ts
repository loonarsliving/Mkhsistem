import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { TablesInsert } from "@/types/database.types";

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

export async function enqueueAdsLaunchJob(supabase: TypedSupabaseClient, projectId: string, branchId: string) {
  const { error } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: "meta_ads_launch", payload: { project_id: projectId, branch_id: branchId } } as TablesInsert<"ai_job_queue">);
  if (error) throw error;
}

export async function updateAdCampaignStatus(supabase: TypedSupabaseClient, id: string, status: "active" | "paused" | "ended") {
  const { error } = await supabase.from("meta_ad_campaigns").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}
