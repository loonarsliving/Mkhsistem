import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY production diagnostic -- open this URL directly in a browser to
 * see exactly what this deployment resolves META_ADS_DAILY_BUDGET_CAP_IDR
 * (and the rest of the Meta Ads config) to at request time, instead of
 * guessing whether it's a missing var, wrong environment scope (Preview vs
 * Production), or a stale deployment. dailyBudgetCapIdr is not a secret (an
 * operational spend limit, not a credential) so it's safe to return as-is.
 * Remove once the "Batas budget iklan harian belum diatur" report is
 * confirmed resolved.
 */
export async function GET() {
  const rawDailyBudgetCap = process.env.META_ADS_DAILY_BUDGET_CAP_IDR ?? null;
  const dailyBudgetCapIdr = Number(rawDailyBudgetCap ?? "0");

  return NextResponse.json({
    META_ACCESS_TOKEN: Boolean(process.env.META_ACCESS_TOKEN),
    META_AD_ACCOUNT_ID: Boolean(process.env.META_AD_ACCOUNT_ID),
    META_PAGE_ID: Boolean(process.env.META_PAGE_ID),
    META_ADS_DAILY_BUDGET_CAP_IDR_raw: rawDailyBudgetCap,
    META_ADS_DAILY_BUDGET_CAP_IDR_parsed: dailyBudgetCapIdr,
    willBlockLaunch: dailyBudgetCapIdr <= 0,
    deploymentEnvironment: process.env.VERCEL_ENV ?? null,
    deploymentUrl: process.env.VERCEL_URL ?? null,
  });
}
