import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { updateAdSetDailyBudget } from "@/lib/meta/ads";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY one-off -- owner's direct ask (2026-07-20): drop "Griya Cariu
 * Indah"'s daily budget to Rp50.000 and "Loonars Living"'s to Rp150.000 on
 * the two currently-active campaigns. Runs the exact same
 * updateAdSetDailyBudget call the new setAdCampaignBudgetAction (Ads
 * Specialist page's inline budget-edit) uses, just triggered once here
 * since there's no authenticated browser session available to click the
 * new pencil icon from this environment. Remove once confirmed applied --
 * same "one-off debug route, deleted after use" pattern as the ad creative
 * refresh route this project already used once before.
 */
const TARGETS = [
  { id: "5b682da1-e1de-420c-91bf-ad272655db6d", metaAdsetId: "120249846999560642", dailyBudgetIdr: 50_000, label: "Griya Cariu Indah" },
  { id: "ed4bd435-1216-4ca4-8a5d-4cfc44f2fcd0", metaAdsetId: "120249842102770642", dailyBudgetIdr: 150_000, label: "Loonars Living" },
];

export async function GET() {
  const supabase = createAdminClient();
  const results: Record<string, unknown>[] = [];

  for (const target of TARGETS) {
    try {
      await updateAdSetDailyBudget(target.metaAdsetId, target.dailyBudgetIdr);
      const { error } = await supabase
        .from("meta_ad_campaigns")
        .update({ daily_budget_idr: target.dailyBudgetIdr, updated_at: new Date().toISOString() })
        .eq("id", target.id);
      if (error) throw new Error(error.message);
      results.push({ label: target.label, status: "ok", dailyBudgetIdr: target.dailyBudgetIdr });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("set-ad-budgets-once: failed", { label: target.label, error: message });
      results.push({ label: target.label, status: "error", error: message });
    }
  }

  return NextResponse.json({ results });
}
