import { NextResponse } from "next/server";

import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/** How many due submissions this single 5-minute tick reminds -- a sane batch cap, not a pacing concern like WhatsApp send limits. */
const BATCH_SIZE = 10;

/**
 * Reminder worker for markom_content_submissions (migration 0096/0097) --
 * triggered every 5 minutes by pg_cron (markom-content-publish-worker),
 * same deliberately-separate-from-scheduling pattern as
 * /api/crm/dispatch-promo-sends.
 *
 * Does NOT call Meta's Content Publishing API -- the company's Instagram
 * account isn't connected to Meta Business yet and the user explicitly
 * deferred that setup (see lib/social/instagram.ts for the dormant
 * create-container/publish code, kept for whenever that connection exists).
 * Instead: at scheduled_publish_at, send Markom a WhatsApp reminder to post
 * the content manually in the real Instagram app, then they mark it
 * published themselves (markContentPublishedAction). reminder_sent_at stops
 * this from re-sending the same reminder every subsequent tick.
 */
export async function POST() {
  const supabase = createAdminClient();

  const { data: due, error } = await supabase
    .from("markom_content_submissions")
    .select("id, media_type, caption, submitted_by, task:task_id(title)")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .lte("scheduled_publish_at", new Date().toISOString())
    .order("scheduled_publish_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    logger.error("publish-content: failed to load due submissions", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  let reminded = 0;
  let failed = 0;

  for (const row of due ?? []) {
    try {
      const task = row.task as { title?: string } | null;
      const { data: employee } = await supabase.from("employees").select("phone").eq("id", row.submitted_by).maybeSingle();

      const title = task?.title ?? "konten Anda";
      const body = `Waktunya posting ke Instagram sekarang -- ini jam terbaik menurut data performa akun kami. Konten: "${title}"${
        row.caption ? `\nCaption: ${row.caption}` : ""
      }\n\nSetelah posting, tandai selesai di sistem (/markom/content-submissions) supaya tercatat.`;

      if (employee?.phone) {
        await sendWhatsAppText(employee.phone, body);
      }
      await supabase.from("mkc_notifications").insert({
        user_id: row.submitted_by,
        type: "crm",
        category: "content_publish_reminder",
        title: "Waktunya posting ke Instagram",
        body,
        link: "/markom/content-submissions",
      });
      await supabase.from("markom_content_submissions").update({ reminder_sent_at: new Date().toISOString() }).eq("id", row.id);
      reminded += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("publish-content: reminder failed", { submissionId: row.id, error: message });
      failed += 1;
    }
  }

  return NextResponse.json({ status: "done", dueCount: (due ?? []).length, reminded, failed });
}
