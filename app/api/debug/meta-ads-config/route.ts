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
  }

  return NextResponse.json(result);
}
