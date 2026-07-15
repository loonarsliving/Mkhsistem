import "server-only";

import { META_CONFIG } from "./config";
import { metaGraphRequest } from "./client";

/**
 * Meta Marketing API primitives for Click-to-WhatsApp lead ads. Every call
 * here is a thin, typed wrapper around one Graph API endpoint -- no
 * business logic (research, copywriting, budget policy) lives in this file,
 * that's lib/ai/domains/markom.ts (research + copy) and the ai_job_queue
 * "meta_ads_launch" job handler (orchestration + the budget-cap safety
 * check), so this module can be unit-reasoned-about as "what Meta's API
 * actually accepts" in one place.
 */

/** Fetches an image by its public URL and uploads it to the ad account's image library, returning the image_hash ad creatives reference. Never generates an image -- the URL always points at a real photo Markom uploaded (crm_project_photos). */
export async function uploadAdImageFromUrl(imageUrl: string): Promise<string> {
  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`Failed to fetch source image (${imageUrl}): HTTP ${imageResponse.status}`);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  const result = await metaGraphRequest<{ images: Record<string, { hash: string }> }>(
    `/${META_CONFIG.adAccountId}/adimages`,
    { bytes: buffer.toString("base64") },
    "POST",
  );
  const entry = Object.values(result.images ?? {})[0];
  if (!entry?.hash) throw new Error("Meta did not return an image hash for the uploaded photo");
  return entry.hash;
}

export interface CreateCampaignInput {
  name: string;
  status?: "ACTIVE" | "PAUSED";
}

/** OUTCOME_ENGAGEMENT is the objective family Click-to-WhatsApp ad sets (destination_type: WHATSAPP, optimization_goal: CONVERSATIONS) live under. */
export async function createAdCampaign(input: CreateCampaignInput): Promise<{ id: string }> {
  return metaGraphRequest(
    `/${META_CONFIG.adAccountId}/campaigns`,
    {
      name: input.name,
      objective: "OUTCOME_ENGAGEMENT",
      special_ad_categories: [],
      status: input.status ?? "PAUSED",
    },
    "POST",
  );
}

export interface AdSetTargeting {
  countries: string[];
  ageMin?: number;
  ageMax?: number;
}

export interface CreateAdSetInput {
  name: string;
  campaignId: string;
  /** IDR is a zero-decimal currency for Meta's Marketing API -- pass whole Rupiah, not cents. */
  dailyBudgetIdr: number;
  targeting: AdSetTargeting;
  status?: "ACTIVE" | "PAUSED";
}

/** destination_type: WHATSAPP + promoted_object.page_id is what makes this a Click-to-WhatsApp ad set -- the actual destination number is whichever WhatsApp Business Account is linked to that Page in Business Manager, not an API field. */
export async function createAdSet(input: CreateAdSetInput): Promise<{ id: string }> {
  return metaGraphRequest(
    `/${META_CONFIG.adAccountId}/adsets`,
    {
      name: input.name,
      campaign_id: input.campaignId,
      daily_budget: Math.round(input.dailyBudgetIdr),
      billing_event: "IMPRESSIONS",
      optimization_goal: "CONVERSATIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: "WHATSAPP",
      promoted_object: { page_id: META_CONFIG.pageId },
      targeting: {
        geo_locations: { countries: input.targeting.countries },
        age_min: input.targeting.ageMin ?? 21,
        age_max: input.targeting.ageMax ?? 55,
      },
      status: input.status ?? "PAUSED",
    },
    "POST",
  );
}

export interface CreateAdCreativeInput {
  name: string;
  /** From uploadAdImageFromUrl -- always a real Markom-uploaded photo. */
  imageHash: string;
  headline: string;
  primaryText: string;
  description?: string;
  /** Pre-filled greeting shown when the lead's WhatsApp chat opens from the ad. */
  welcomeMessage?: string;
}

/** object_story_spec.link_data + call_to_action WHATSAPP_MESSAGE is what makes tapping the ad open a WhatsApp chat instead of a normal landing page. */
export async function createAdCreative(input: CreateAdCreativeInput): Promise<{ id: string }> {
  const waLink = META_CONFIG.whatsappPhoneNumber
    ? `https://api.whatsapp.com/send?phone=${META_CONFIG.whatsappPhoneNumber}`
    : "https://api.whatsapp.com/send";

  return metaGraphRequest(
    `/${META_CONFIG.adAccountId}/adcreatives`,
    {
      name: input.name,
      object_story_spec: {
        page_id: META_CONFIG.pageId,
        link_data: {
          image_hash: input.imageHash,
          link: waLink,
          message: input.primaryText,
          name: input.headline,
          description: input.description,
          call_to_action: { type: "WHATSAPP_MESSAGE", value: { app_destination: "WHATSAPP" } },
        },
        ...(input.welcomeMessage ? { page_welcome_message: input.welcomeMessage } : {}),
      },
    },
    "POST",
  );
}

export interface CreateAdInput {
  name: string;
  adSetId: string;
  creativeId: string;
  status?: "ACTIVE" | "PAUSED";
}

export async function createAd(input: CreateAdInput): Promise<{ id: string }> {
  return metaGraphRequest(
    `/${META_CONFIG.adAccountId}/ads`,
    {
      name: input.name,
      adset_id: input.adSetId,
      creative: { creative_id: input.creativeId },
      status: input.status ?? "PAUSED",
    },
    "POST",
  );
}

export interface LaunchCampaignInput {
  projectName: string;
  photoUrl: string;
  headline: string;
  primaryText: string;
  description?: string;
  welcomeMessage?: string;
  dailyBudgetIdr: number;
}

export interface LaunchCampaignResult {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
}

/**
 * The full Campaign -> AdSet -> Creative -> Ad sequence, real spend from
 * the moment it returns. Pure Meta orchestration only -- no DB writes, so
 * both the fully-autonomous job handler (processMetaAdsLaunch,
 * app/api/ai/process-job/route.ts) and the manual "Luncurkan" server
 * action (launchDraftCampaignAction, features/markom/actions/ads.actions.ts)
 * share this instead of duplicating it, each doing its own DB bookkeeping
 * around the call.
 */
export async function launchWhatsAppLeadCampaign(input: LaunchCampaignInput): Promise<LaunchCampaignResult> {
  const imageHash = await uploadAdImageFromUrl(input.photoUrl);
  const campaign = await createAdCampaign({ name: `${input.projectName} - Leads WA (AI)`, status: "ACTIVE" });
  const adSet = await createAdSet({
    name: `${input.projectName} - Ad Set`,
    campaignId: campaign.id,
    dailyBudgetIdr: input.dailyBudgetIdr,
    targeting: { countries: ["ID"] },
    status: "ACTIVE",
  });
  const creative = await createAdCreative({
    name: `${input.projectName} - Creative`,
    imageHash,
    headline: input.headline,
    primaryText: input.primaryText,
    description: input.description,
    welcomeMessage: input.welcomeMessage,
  });
  const ad = await createAd({ name: `${input.projectName} - Ad`, adSetId: adSet.id, creativeId: creative.id, status: "ACTIVE" });
  return { campaignId: campaign.id, adSetId: adSet.id, creativeId: creative.id, adId: ad.id };
}

/** Human override from the Ads Specialist page -- pause/resume an ad AI already launched. */
export async function setAdStatus(adId: string, status: "ACTIVE" | "PAUSED"): Promise<{ success: boolean }> {
  return metaGraphRequest(`/${adId}`, { status }, "POST");
}

/**
 * Hard safety gate: fails closed (throws) if no operator has set
 * META_ADS_DAILY_BUDGET_CAP_IDR, or if today's spend already reached that
 * cap -- called before every autonomous campaign launch, before any Meta
 * API call that would commit real spend. Returns the IDR headroom left
 * today so the caller can clamp a new campaign's daily_budget to it.
 */
export async function getRemainingDailyBudgetIdr(): Promise<number> {
  if (META_CONFIG.dailyBudgetCapIdr <= 0) {
    throw new Error("META_ADS_DAILY_BUDGET_CAP_IDR is not set -- AI cannot launch or scale ad spend until an operator sets a daily budget cap");
  }
  const spentToday = await getTodaySpendIdr();
  const remaining = META_CONFIG.dailyBudgetCapIdr - spentToday;
  if (remaining <= 0) {
    throw new Error(
      `Daily ad budget cap (Rp ${META_CONFIG.dailyBudgetCapIdr.toLocaleString("id-ID")}) already reached today (spent Rp ${spentToday.toLocaleString("id-ID")})`,
    );
  }
  return remaining;
}

/** Total spend (IDR) across the whole ad account so far today -- the budget-cap safety check reads this before every new campaign launch. */
export async function getTodaySpendIdr(): Promise<number> {
  const insights = await metaGraphRequest<{ data: { spend?: string }[] }>(`/${META_CONFIG.adAccountId}/insights`, {
    date_preset: "today",
    fields: "spend",
  });
  return Number(insights.data?.[0]?.spend ?? "0");
}

export interface AdInsights {
  spendIdr: number;
  impressions: number;
  clicks: number;
  messagingConversationsStarted: number;
}

/** Per-ad performance, used both by the Ads Specialist dashboard and by the AI's own decision to keep/pause/scale a campaign. */
export async function getAdInsights(adId: string): Promise<AdInsights> {
  const insights = await metaGraphRequest<{
    data: { spend?: string; impressions?: string; clicks?: string; actions?: { action_type: string; value: string }[] }[];
  }>(`/${adId}/insights`, { fields: "spend,impressions,clicks,actions" });

  const row = insights.data?.[0];
  const messagingConversationsStarted = Number(
    row?.actions?.find((a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d")?.value ?? "0",
  );

  return {
    spendIdr: Number(row?.spend ?? "0"),
    impressions: Number(row?.impressions ?? "0"),
    clicks: Number(row?.clicks ?? "0"),
    messagingConversationsStarted,
  };
}
