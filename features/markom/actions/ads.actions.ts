"use server";

import { revalidatePath } from "next/cache";

import { analyzeAdPerformance } from "@/lib/ai/domains/markom";
import { hasPermission, requirePermission, requireSession } from "@/lib/rbac/session";
import { getAdAccountBalanceInfo, getAdInsights, getRemainingDailyBudgetIdr, launchWhatsAppLeadCampaign, setAdStatus } from "@/lib/meta/ads";
import { isMetaConfigured } from "@/lib/meta/config";
import { createClient } from "@/lib/supabase/server";
import {
  getAdCampaign,
  listAdCampaigns,
  markAdCampaignFailed,
  markAdCampaignLaunched,
  requestAdsResearch,
  saveAdCampaignAnalysis,
  updateAdCampaignStatus,
} from "@/repositories/meta-ads.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

export async function listAdCampaignsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  const scopedToOwnBranch = !hasPermission(session, "ad_campaign.manage");
  return listAdCampaigns(supabase, scopedToOwnBranch ? session.employee.branch_id : undefined);
}

export type AdAccountBalanceStatus =
  | { status: "not_configured" }
  | { status: "error"; message: string }
  | { status: "ok"; balanceIdr: number; amountSpentIdr: number; currency: string; fundingSourceDescription: string | null };

/** Read-only account balance/spend snapshot -- there is no API to add funds, only to read what's already there (see lib/meta/ads.ts). Always returns a visible status instead of null, so a misconfigured or rejected Meta call shows up on the page instead of the card just silently not appearing. */
export async function getAdAccountBalanceAction(): Promise<AdAccountBalanceStatus> {
  await requirePermission("ad_campaign.view");
  if (!isMetaConfigured()) return { status: "not_configured" };
  try {
    const info = await getAdAccountBalanceInfo();
    return { status: "ok", ...info };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : "Gagal mengambil info akun iklan dari Meta" };
  }
}

/** Step 1: research only, no spend. AI reads current trends/competitor ads and drafts copy + picks a photo, saved as a 'draft' row Markom reviews as a reference before deciding to launch. */
export async function requestAdsResearchAction(projectId: string, branchId: string): Promise<ActionResult> {
  await requirePermission("ad_campaign.manage");
  const supabase = await createClient();
  try {
    await requestAdsResearch(supabase, projectId, branchId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menjadwalkan riset iklan");
  }
  revalidatePath("/markom/ads");
  return actionSuccess();
}

/** Step 2: explicit human confirmation to actually spend -- launches a saved 'draft' row's exact content via the real Meta API, no new Gemini call. */
export async function launchDraftCampaignAction(campaignId: string): Promise<ActionResult> {
  await requirePermission("ad_campaign.manage");
  const supabase = await createClient();

  if (!isMetaConfigured()) {
    return actionError("Meta integration belum dikonfigurasi (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID)");
  }

  const draft = await getAdCampaign(supabase, campaignId);
  if (draft.status !== "draft") return actionError("Iklan ini sudah diluncurkan atau bukan draft");

  const photo = draft.photo as { public_url?: string } | null;
  const project = draft.project as { name?: string } | null;
  if (!photo?.public_url) return actionError("Foto untuk draft ini tidak ditemukan");

  let dailyBudgetIdr: number;
  try {
    const remaining = await getRemainingDailyBudgetIdr();
    dailyBudgetIdr = Math.min(draft.daily_budget_idr, remaining);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Cek batas budget gagal");
  }

  try {
    const result = await launchWhatsAppLeadCampaign({
      projectName: project?.name ?? draft.name,
      photoUrl: photo.public_url,
      headline: draft.headline,
      primaryText: draft.primary_text,
      description: draft.description ?? undefined,
      welcomeMessage: draft.welcome_message ?? undefined,
      dailyBudgetIdr,
    });
    await markAdCampaignLaunched(supabase, campaignId, {
      campaignId: result.campaignId,
      adSetId: result.adSetId,
      creativeId: result.creativeId,
      adId: result.adId,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Meta API call failed";
    await markAdCampaignFailed(supabase, campaignId, reason);
    revalidatePath("/markom/ads");
    return actionError(`Gagal meluncurkan iklan: ${reason}`);
  }

  revalidatePath("/markom/ads");
  return actionSuccess();
}

/** Fetches fresh spend/impressions/clicks/WhatsApp-conversations from Meta (a plain API read, no AI) then has AI write a short analysis + recommendation from those numbers -- both cached on the row so the page doesn't need to re-fetch/re-generate on every view. */
export async function analyzeAdCampaignAction(id: string): Promise<ActionResult> {
  await requirePermission("ad_campaign.manage");
  const supabase = await createClient();

  const campaign = await getAdCampaign(supabase, id);
  if (!campaign.meta_ad_id) return actionError("Iklan ini belum diluncurkan ke Meta, belum ada yang bisa dianalisis");

  try {
    const insights = await getAdInsights(campaign.meta_ad_id);
    const project = campaign.project as { name?: string } | null;
    const daysRunning = Math.max(1, Math.ceil((Date.now() - new Date(campaign.created_at).getTime()) / (24 * 60 * 60 * 1000)));

    const analysis = await analyzeAdPerformance({
      projectName: project?.name ?? campaign.name,
      headline: campaign.headline,
      dailyBudgetIdr: campaign.daily_budget_idr,
      daysRunning,
      spendIdr: insights.spendIdr,
      impressions: insights.impressions,
      clicks: insights.clicks,
      conversationsStarted: insights.messagingConversationsStarted,
    });

    await saveAdCampaignAnalysis(supabase, id, {
      spendIdr: insights.spendIdr,
      impressions: insights.impressions,
      clicks: insights.clicks,
      conversationsStarted: insights.messagingConversationsStarted,
      aiAnalysis: analysis,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menganalisis performa iklan");
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
