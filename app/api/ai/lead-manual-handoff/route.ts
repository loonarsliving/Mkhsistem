import { NextResponse } from "next/server";

import { handoffProspectToKepalaCabang } from "@/lib/ai/domains/lead-nurture";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off manual trigger for handoffProspectToKepalaCabang -- not part of
 * any automated flow. Exists to correct a specific lead by hand (e.g. one
 * who got a wrong AI answer before "handoff" mode existed for their
 * project, see migration 0231): send them a custom message (an apology,
 * typically) and hand them off to their branch's Kepala Cabang immediately.
 * Same cron-auth guard as every other operator-triggered automation route.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  let body: { prospect_id?: unknown; message?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "invalid JSON body" }, { status: 400 });
  }

  const prospectId = typeof body.prospect_id === "string" ? body.prospect_id : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!prospectId || !message) {
    return NextResponse.json({ status: "error", error: "prospect_id and message are required" }, { status: 400 });
  }

  const result = await handoffProspectToKepalaCabang(prospectId, message);
  return NextResponse.json({ status: result.sent ? "ok" : "error" }, { status: result.sent ? 200 : 502 });
}
