import { NextResponse } from "next/server";

import { dispatchDueHospitalityReports } from "@/lib/hospitality/report-generator";
import { logger } from "@/lib/logger";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called by pg_cron 'hospitality-report-dispatch' (0291) every 15 minutes via
 * automation_post(). Generates each scheduled Hospitality report (morning /
 * afternoon / end of day, times in mkc_chat_departments.settings) that is due
 * and not yet done. Safe to call repeatedly: mkc_hosp_report_begin() makes
 * every period idempotent and retries a failure at most 3 times.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const results = await dispatchDueHospitalityReports();
    return NextResponse.json({ status: "ok", results });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("hospitality report dispatch failed", { error: message });
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
