import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { getAdAccountBalanceInfo } from "@/lib/meta/ads";
import { isMetaConfigured } from "@/lib/meta/config";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOW_BALANCE_THRESHOLD_IDR = 100_000;
const STATE_ROW_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Every 6 hours via pg_cron (migration 0135): alerts every active Super
 * Admin once per low-balance episode when the Meta Ads account's prepaid
 * balance drops below Rp 100.000 -- not every run while it's still low.
 * balanceIdr is only meaningful for prepaid accounts (see
 * lib/meta/ads.ts's AdAccountBalanceInfo doc); 0 means monthly invoicing,
 * not "no money", so that case is skipped entirely rather than alerting.
 */
export async function POST() {
  if (!isMetaConfigured()) {
    return NextResponse.json({ status: "skipped", reason: "not_configured" });
  }

  const supabase = createAdminClient();

  let balanceIdr: number;
  try {
    ({ balanceIdr } = await getAdAccountBalanceInfo());
  } catch (err) {
    logger.error("meta ads balance check failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ status: "error", error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }

  if (balanceIdr <= 0) {
    return NextResponse.json({ status: "skipped", reason: "not_prepaid" });
  }

  const { data: state } = await supabase.from("meta_ads_balance_state").select("alert_active").eq("id", STATE_ROW_ID).single();
  const isLow = balanceIdr < LOW_BALANCE_THRESHOLD_IDR;
  const isNewEpisode = isLow && !state?.alert_active;

  if (isNewEpisode) {
    const { data: admins } = await supabase
      .from("v_employee_directory")
      .select("id")
      .eq("role_key", "super_admin")
      .eq("employment_status", "active")
      .is("deleted_at", null);

    if (admins && admins.length > 0) {
      await supabase.from("mkc_notifications").insert(
        admins.map((admin) => ({
          user_id: admin.id,
          type: "system" as const,
          category: "meta_ads_balance_low",
          title: "Saldo Meta Ads menipis",
          body: `Saldo akun iklan Meta tinggal Rp ${balanceIdr.toLocaleString("id-ID")} (di bawah ambang Rp ${LOW_BALANCE_THRESHOLD_IDR.toLocaleString("id-ID")}). Segera top up di Meta Business Suite -> Billing agar kampanye tidak terhenti.`,
          link: "/markom/ads",
        })),
      );
    }
  }

  await supabase
    .from("meta_ads_balance_state")
    .update({ last_balance_idr: balanceIdr, alert_active: isLow, checked_at: new Date().toISOString() })
    .eq("id", STATE_ROW_ID);

  return NextResponse.json({ status: "done", balanceIdr, alerted: isNewEpisode });
}
