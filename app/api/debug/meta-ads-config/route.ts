import { NextResponse } from "next/server";

import { metaGraphRequest } from "@/lib/meta/client";
import { META_CONFIG, isMetaConfigured } from "@/lib/meta/config";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY production diagnostic -- open this URL directly in a browser to
 * see exactly what this deployment resolves the Meta Ads env vars to at
 * request time, AND (the part that actually matters for "Izin Halaman Tidak
 * Memadai" despite the user insisting access is already full) what the
 * access token itself can see: its own identity, every Page it can manage
 * ads for, and whether META_PAGE_ID is among them. "Full access" granted in
 * one place (e.g. personal Page Roles) doesn't necessarily reach the actual
 * identity behind this token (e.g. a Business Manager System User) -- this
 * proves it either way instead of trusting the Meta UI's framing. Nothing
 * secret is returned, only names/ids the user can already see themselves in
 * Facebook/Business Manager. Remove once Ads Specialist launches cleanly.
 */
export async function GET() {
  const rawDailyBudgetCap = process.env.META_ADS_DAILY_BUDGET_CAP_IDR ?? null;
  const dailyBudgetCapIdr = Number(rawDailyBudgetCap ?? "0");

  const result: Record<string, unknown> = {
    META_ACCESS_TOKEN: Boolean(process.env.META_ACCESS_TOKEN),
    META_AD_ACCOUNT_ID: Boolean(process.env.META_AD_ACCOUNT_ID),
    META_PAGE_ID: Boolean(process.env.META_PAGE_ID),
    META_PAGE_ID_value: META_CONFIG.pageId || null,
    META_ADS_DAILY_BUDGET_CAP_IDR_raw: rawDailyBudgetCap,
    META_ADS_DAILY_BUDGET_CAP_IDR_parsed: dailyBudgetCapIdr,
    willBlockLaunch: dailyBudgetCapIdr <= 0,
    deploymentEnvironment: process.env.VERCEL_ENV ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
  };

  if (isMetaConfigured()) {
    try {
      result.tokenIdentity = await metaGraphRequest<{ id: string; name: string }>("/me", { fields: "id,name" });
    } catch (err) {
      result.tokenIdentityError = err instanceof Error ? err.message : String(err);
    }

    try {
      const accessiblePages = await metaGraphRequest<{ data: { id: string; name: string; tasks?: string[] }[] }>("/me/accounts", {
        fields: "id,name,tasks",
        limit: 100,
      });
      result.accessiblePages = accessiblePages.data;
      result.metaPageIdIsAccessible = (accessiblePages.data ?? []).some((p) => p.id === META_CONFIG.pageId);
    } catch (err) {
      result.accessiblePagesError = err instanceof Error ? err.message : String(err);
    }

    try {
      result.targetPage = await metaGraphRequest<{ id: string; name: string }>(`/${META_CONFIG.pageId}`, { fields: "id,name" });
    } catch (err) {
      result.targetPageError = err instanceof Error ? err.message : String(err);
    }

    // Live status of the campaign launched last night (meta_campaign_id
    // 120249772618290642, per meta_ad_campaigns) -- lets us prove whether
    // it's genuinely active/delivering per Meta's own API right now (not
    // just our DB's copy of its status at launch time), independent of
    // whatever the operator's Meta Business Suite UI happens to be showing
    // or filtering by. Hardcoded on purpose -- this is a one-off check for
    // this specific investigation, not a general-purpose lookup.
    const campaignId = "120249772618290642";
    try {
      result.campaignLiveStatus = await metaGraphRequest<Record<string, unknown>>(`/${campaignId}`, {
        fields: "id,name,status,effective_status,objective,special_ad_categories",
      });
      result.adsManagerDeepLink = `https://business.facebook.com/adsmanager/manage/campaigns?act=${META_CONFIG.adAccountId.replace("act_", "")}&selected_campaign_ids=${campaignId}`;
    } catch (err) {
      result.campaignLiveStatusError = err instanceof Error ? err.message : String(err);
    }

    // Investigating "why does the Cibarusah (non-villa) campaign's reach
    // extend to Yogyakarta" -- this ad set's real geo_locations targeting
    // straight from Meta, not our DB's copy, to confirm/rule out whether it
    // actually got the new AI-researched local-area targeting (0094/0096)
    // or the old countrywide fallback (it was created ~05:57 UTC, right
    // around when that feature's deploy went live -- meta_ad_campaigns.target_areas
    // being null on this row already suggests the old code path ran).
    const cibarusahAdsetId = "120249784471370642";
    try {
      result.cibarusahAdsetTargeting = await metaGraphRequest<Record<string, unknown>>(`/${cibarusahAdsetId}`, {
        fields: "id,name,targeting",
      });
    } catch (err) {
      result.cibarusahAdsetTargetingError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json(result);
}
