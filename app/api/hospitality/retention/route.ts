import { NextResponse } from "next/server";

import { runEvidenceRetention } from "@/lib/hospitality/retention-runner";
import { logger } from "@/lib/logger";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Called hourly by pg_cron 'hospitality-evidence-retention' (0291). Deletes
 * expired chat/evidence files from the private 'hospitality-evidence' bucket
 * (the Storage objects themselves) and records each run in
 * mkc_chat_retention_runs. Messages, checklists, issues and reports stay.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runEvidenceRetention();
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("evidence retention run failed", { error: message });
    return NextResponse.json({ status: "error", error: message }, { status: 500 });
  }
}
