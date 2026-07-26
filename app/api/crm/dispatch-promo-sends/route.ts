import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { normalizeIndonesianPhone } from "@/features/messaging/schemas/messaging.schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How many messages this single 5-minute tick is allowed to send -- the actual anti-ban pacing knob. */
const BATCH_SIZE = 5;

/**
 * Paced sender worker for crm_promo_sends (migration 0089) -- triggered
 * every 5 minutes by pg_cron (crm-promo-sends-worker), same
 * requireCronAuth-guarded pattern as /api/social/capture-snapshots.
 * Deliberately
 * separate from the (instant) enqueue step in
 * crm_run_promo_cadence_dispatch(): sending only a small batch per tick,
 * and only during each template's chosen send_hour_local (WITA), is what
 * keeps this from looking like a mass blast to WhatsApp.
 */
export async function POST(request: Request) {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
  const supabase = createAdminClient();
  const witaHour = (new Date().getUTCHours() + 8) % 24;

  const { data: candidates, error } = await supabase
    .from("crm_promo_sends")
    .select("id, message_body, prospect:prospect_id(phone, phone_normalized), template:template_id(photo_public_url, send_hour_local)")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    logger.error("dispatch-promo-sends: failed to load queued sends", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  const due = (candidates ?? []).filter((row) => {
    const template = row.template as { send_hour_local: number } | null;
    return template?.send_hour_local === witaHour;
  });
  const batch = due.slice(0, BATCH_SIZE);

  let sent = 0;
  let failed = 0;

  for (const row of batch) {
    const prospect = row.prospect as { phone: string; phone_normalized: string | null } | null;
    const template = row.template as { photo_public_url: string | null } | null;
    const phone = prospect?.phone_normalized || (prospect?.phone ? normalizeIndonesianPhone(prospect.phone) : null);

    if (!phone) {
      await supabase.from("crm_promo_sends").update({ status: "failed", error: "Prospect tidak punya nomor HP valid" }).eq("id", row.id);
      failed += 1;
      continue;
    }

    const result = template?.photo_public_url
      ? await sendWhatsAppImage(phone, template.photo_public_url, row.message_body)
      : await sendWhatsAppText(phone, row.message_body);

    if (result.success) {
      await supabase.from("crm_promo_sends").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", row.id);
      sent += 1;
    } else {
      await supabase.from("crm_promo_sends").update({ status: "failed", error: result.error ?? "Gagal mengirim" }).eq("id", row.id);
      failed += 1;
    }
  }

  return NextResponse.json({ status: "done", witaHour, dueCount: due.length, sent, failed });
}
