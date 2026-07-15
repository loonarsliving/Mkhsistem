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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  let imageResponse: Response;
  try {
    imageResponse = await fetch(imageUrl, { signal: controller.signal });
  } catch (err) {
    throw new Error(
      err instanceof Error && err.name === "AbortError"
        ? `Gagal mengambil foto sumber (${imageUrl}): tidak merespon dalam 20 detik`
        : `Gagal mengambil foto sumber (${imageUrl}): ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timeout);
  }
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

export interface ResolvedGeoLocation {
  key: string;
  name: string;
  type: "city" | "region";
}

/** Resolves a human place name (e.g. "Yogyakarta", "Bali") to Meta's opaque targeting key via the Targeting Search API -- geo_locations.cities/regions need this key, not the plain name. Returns null if Meta has no match. */
export async function searchAdGeoLocation(query: string): Promise<ResolvedGeoLocation | null> {
  const result = await metaGraphRequest<{ data: { key: string; name: string; type: string; country_code?: string }[] }>("/search", {
    type: "adgeolocation",
    q: query,
    location_types: JSON.stringify(["city", "region"]),
    country_code: "ID",
    limit: 1,
  });
  const match = result.data?.find((r) => r.type === "city" || r.type === "region");
  if (!match) return null;
  return { key: match.key, name: match.name, type: match.type === "region" ? "region" : "city" };
}

/**
 * Villa leasehold buyer cities per the user's own market knowledge (not
 * derived from CRM data -- at the time this was added, the CRM had zero
 * recorded closings and prospect-origin data was dominated by wherever
 * marketing had already focused, not a reliable "who actually buys"
 * signal). Plain business config, not something worth spending an AI call
 * on -- edit this list directly as real closing data accumulates and a
 * data-driven city list becomes possible.
 */
export const LEASEHOLD_TARGET_CITIES = ["Yogyakarta", "Surabaya", "Bandung", "Surakarta", "Bali", "Malang", "Semarang"];

let cachedLeaseholdGeoLocations: AdSetTargeting | null = null;

/**
 * Resolves LEASEHOLD_TARGET_CITIES into real Meta targeting keys once per
 * process (they're stable place IDs, no need to re-resolve every launch)
 * and splits them into cities vs regions since Meta returns "Bali" as a
 * region, not a city. Falls back to country-wide ["ID"] targeting if
 * resolution comes back empty (a Meta API hiccup here shouldn't block an
 * ad launch entirely -- it just makes that one launch less targeted).
 */
export async function getLeaseholdTargetGeoLocations(): Promise<AdSetTargeting> {
  if (cachedLeaseholdGeoLocations) return cachedLeaseholdGeoLocations;

  const resolved = await Promise.all(LEASEHOLD_TARGET_CITIES.map((name) => searchAdGeoLocation(name)));
  const cities = resolved.filter((r): r is ResolvedGeoLocation => r?.type === "city").map((r) => ({ key: r.key, radiusKm: 30 }));
  const regions = resolved.filter((r): r is ResolvedGeoLocation => r?.type === "region").map((r) => ({ key: r.key }));

  if (cities.length === 0 && regions.length === 0) {
    return { countries: ["ID"] };
  }

  cachedLeaseholdGeoLocations = { cities, regions };
  return cachedLeaseholdGeoLocations;
}

export interface CreateCampaignInput {
  name: string;
  status?: "ACTIVE" | "PAUSED";
}

/** Rollback helper for launchWhatsAppLeadCampaign -- deletes a campaign that was created but whose ad set/creative/ad step failed, so a failed launch attempt never leaves an orphaned empty campaign behind. */
export async function deleteAdCampaign(campaignId: string): Promise<void> {
  await metaGraphRequest(`/${campaignId}`, {}, "DELETE");
}

/**
 * OUTCOME_ENGAGEMENT is the objective family Click-to-WhatsApp ad sets
 * (destination_type: WHATSAPP, optimization_goal: CONVERSATIONS) live under.
 * No campaign-level daily_budget is ever set here -- budget lives on the ad
 * set (createAdSet) -- so Meta requires is_adset_budget_sharing_enabled to
 * be explicit (error_subcode 4834011 otherwise). false keeps this campaign's
 * single ad set fully in control of its own budget, matching the existing
 * per-launch dailyBudgetIdr semantics, instead of opting into Meta's
 * Advantage Campaign Budget sharing behavior (ad sets pooling/reallocating
 * ~20% of budget among each other).
 */
export async function createAdCampaign(input: CreateCampaignInput): Promise<{ id: string }> {
  return metaGraphRequest(
    `/${META_CONFIG.adAccountId}/campaigns`,
    {
      name: input.name,
      objective: "OUTCOME_ENGAGEMENT",
      special_ad_categories: [],
      status: input.status ?? "PAUSED",
      is_adset_budget_sharing_enabled: false,
    },
    "POST",
  );
}

export interface AdSetTargeting {
  countries?: string[];
  /** Resolved via searchAdGeoLocation -- Meta's geo_locations.cities needs its opaque `key`, not a plain city name. */
  cities?: { key: string; radiusKm?: number }[];
  regions?: { key: string }[];
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
        geo_locations: {
          ...(input.targeting.countries?.length ? { countries: input.targeting.countries } : {}),
          ...(input.targeting.cities?.length
            ? { cities: input.targeting.cities.map((c) => ({ key: c.key, radius: c.radiusKm ?? 25, distance_unit: "kilometer" })) }
            : {}),
          ...(input.targeting.regions?.length ? { regions: input.targeting.regions.map((r) => ({ key: r.key })) } : {}),
        },
        age_min: input.targeting.ageMin ?? 21,
        age_max: input.targeting.ageMax ?? 55,
        // Advantage+ Audience is now a required explicit flag (error_subcode
        // 1870227 otherwise). Enabled (1) deliberately -- it lets Meta's
        // delivery system find people likely to convert beyond our exact
        // targeting criteria (still bounded by the specified geo/age), which
        // is what actually drives more clicks/conversations for a fixed
        // budget, not just a flag to satisfy the API.
        targeting_automation: { advantage_audience: 1 },
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
  /** Defaults to country-wide ["ID"] if omitted -- callers pass getLeaseholdTargetGeoLocations() for villa projects. */
  targeting?: AdSetTargeting;
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

  // Once the campaign exists, every following step that throws must delete it
  // first -- otherwise a failed ad set/creative/ad step (e.g. a Page
  // permission error) leaves an empty, real, ACTIVE campaign sitting in the
  // ad account forever, and every retry piles up another one.
  try {
    const adSet = await createAdSet({
      name: `${input.projectName} - Ad Set`,
      campaignId: campaign.id,
      dailyBudgetIdr: input.dailyBudgetIdr,
      targeting: input.targeting ?? { countries: ["ID"] },
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
  } catch (err) {
    await deleteAdCampaign(campaign.id).catch(() => undefined);
    throw err;
  }
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
    throw new Error(
      "Batas budget iklan harian belum diatur. Tambahkan environment variable META_ADS_DAILY_BUDGET_CAP_IDR di Vercel (isi dengan angka Rupiah, mis. 200000 untuk Rp 200.000/hari), lalu redeploy -- ini pengaman wajib agar AI/sistem tidak bisa menghabiskan budget iklan tanpa batas.",
    );
  }
  const spentToday = await getTodaySpendIdr();
  const remaining = META_CONFIG.dailyBudgetCapIdr - spentToday;
  if (remaining <= 0) {
    throw new Error(
      `Batas budget iklan harian (Rp ${META_CONFIG.dailyBudgetCapIdr.toLocaleString("id-ID")}) sudah tercapai hari ini (sudah terpakai Rp ${spentToday.toLocaleString("id-ID")}). Coba lagi besok, atau naikkan META_ADS_DAILY_BUDGET_CAP_IDR.`,
    );
  }
  return remaining;
}

export interface AdAccountBalanceInfo {
  /** Only meaningful for prepaid accounts -- 0 (or absent) for accounts on monthly invoicing/direct debit, where there's no prepaid balance to draw down. */
  balanceIdr: number;
  amountSpentIdr: number;
  currency: string;
  fundingSourceDescription: string | null;
}

/**
 * Read-only -- the Marketing API has no endpoint to add funds to an ad
 * account. Adding/changing a payment method or topping up a prepaid
 * balance can only be done by a human in Meta Business Suite -> Billing.
 * This just surfaces what's already there.
 */
export async function getAdAccountBalanceInfo(): Promise<AdAccountBalanceInfo> {
  const account = await metaGraphRequest<{
    balance?: string;
    amount_spent?: string;
    currency?: string;
    funding_source_details?: { display_string?: string };
  }>(`/${META_CONFIG.adAccountId}`, { fields: "balance,amount_spent,currency,funding_source_details" });

  return {
    balanceIdr: Number(account.balance ?? "0"),
    amountSpentIdr: Number(account.amount_spent ?? "0"),
    currency: account.currency ?? "IDR",
    fundingSourceDescription: account.funding_source_details?.display_string ?? null,
  };
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
