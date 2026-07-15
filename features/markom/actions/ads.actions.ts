"use server";

import { revalidatePath } from "next/cache";

import { hasPermission, requirePermission, requireSession } from "@/lib/rbac/session";
import { setAdStatus } from "@/lib/meta/ads";
import { createClient } from "@/lib/supabase/server";
import { enqueueAdsLaunchJob, listAdCampaigns, updateAdCampaignStatus } from "@/repositories/meta-ads.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

export async function listAdCampaignsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  const scopedToOwnBranch = !hasPermission(session, "ad_campaign.manage");
  return listAdCampaigns(supabase, scopedToOwnBranch ? session.employee.branch_id : undefined);
}

/** Manual trigger -- normally AI launches these on its own weekly cron (markom_run_ai_ads_dispatch), this lets Markom ask for a fresh campaign for a specific project right now instead of waiting for the next cycle. */
export async function launchAdCampaignAction(projectId: string, branchId: string): Promise<ActionResult> {
  await requirePermission("ad_campaign.manage");
  const supabase = await createClient();
  try {
    await enqueueAdsLaunchJob(supabase, projectId, branchId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menjadwalkan peluncuran iklan");
  }
  revalidatePath("/markom/ads");
  return actionSuccess();
}

export async function setAdCampaignStatusAction(id: string, metaAdId: string | null, status: "active" | "paused"): Promise<ActionResult> {
  await requirePermission("ad_campaign.manage");
  if (!metaAdId) return actionError("Iklan ini belum berhasil dibuat di Meta, tidak ada yang bisa diubah statusnya");

  const supabase = await createClient();
  try {
    await setAdStatus(metaAdId, status === "active" ? "ACTIVE" : "PAUSED");
    await updateAdCampaignStatus(supabase, id, status);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah status iklan");
  }
  revalidatePath("/markom/ads");
  return actionSuccess();
}
