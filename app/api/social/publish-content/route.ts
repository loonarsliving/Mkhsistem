import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createInstagramMediaContainer, getInstagramContainerStatus, publishInstagramContainer } from "@/lib/social/instagram";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

/** How many due submissions this single 5-minute tick processes -- Instagram publishing isn't ban-sensitive the way WhatsApp pacing is, this is just a sane batch cap. */
const BATCH_SIZE = 5;

/**
 * Paced publish worker for markom_content_submissions (migration 0096) --
 * triggered every 5 minutes by pg_cron (markom-content-publish-worker),
 * same deliberately-separate-from-scheduling pattern as
 * /api/crm/dispatch-promo-sends. A video container can take longer than
 * this request's budget to finish processing on Meta's side -- rather than
 * blocking, one status check is done per tick; if it's not FINISHED yet the
 * row is left in 'scheduled' with ig_container_id already set, so the next
 * tick re-checks the SAME container instead of creating a duplicate one.
 */
export async function POST() {
  const supabase = createAdminClient();

  const { data: due, error } = await supabase
    .from("markom_content_submissions")
    .select("id, media_type, public_url, caption, ig_container_id, submitted_by")
    .eq("status", "scheduled")
    .lte("scheduled_publish_at", new Date().toISOString())
    .order("scheduled_publish_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    logger.error("publish-content: failed to load due submissions", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  let published = 0;
  let stillProcessing = 0;
  let failed = 0;

  for (const row of due ?? []) {
    try {
      let containerId = row.ig_container_id;

      if (!containerId) {
        const container = await createInstagramMediaContainer({
          mediaType: row.media_type === "video" ? "REELS" : "IMAGE",
          mediaUrl: row.public_url,
          caption: row.caption ?? "",
        });
        containerId = container.id;
        await supabase.from("markom_content_submissions").update({ ig_container_id: containerId }).eq("id", row.id);
      }

      const status = await getInstagramContainerStatus(containerId);

      if (status === "FINISHED") {
        const published_media = await publishInstagramContainer(containerId);
        await supabase
          .from("markom_content_submissions")
          .update({ status: "published", ig_media_id: published_media.id, published_at: new Date().toISOString() })
          .eq("id", row.id);
        await supabase.from("mkc_notifications").insert({
          user_id: row.submitted_by,
          type: "crm",
          category: "content_published",
          title: "Konten berhasil dipublish ke Instagram",
          body: "Konten yang Anda upload sudah live di Instagram.",
          link: "/markom/content-submissions",
        });
        published += 1;
      } else if (status === "IN_PROGRESS") {
        // Leave 'scheduled' -- next tick re-checks this same container.
        stillProcessing += 1;
      } else {
        await supabase
          .from("markom_content_submissions")
          .update({ status: "failed", failure_reason: `Container status: ${status}` })
          .eq("id", row.id);
        await supabase.from("mkc_notifications").insert({
          user_id: row.submitted_by,
          type: "crm",
          category: "content_published",
          title: "Gagal publish konten ke Instagram",
          body: `Instagram menolak konten ini (status: ${status}). Cek detailnya di sistem.`,
          link: "/markom/content-submissions",
        });
        failed += 1;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("publish-content: submission failed", { submissionId: row.id, error: message });
      await supabase.from("markom_content_submissions").update({ status: "failed", failure_reason: message }).eq("id", row.id);
      await supabase.from("mkc_notifications").insert({
        user_id: row.submitted_by,
        type: "crm",
        category: "content_published",
        title: "Gagal publish konten ke Instagram",
        body: `Terjadi error: ${message}`,
        link: "/markom/content-submissions",
      });
      failed += 1;
    }
  }

  return NextResponse.json({ status: "done", dueCount: (due ?? []).length, published, stillProcessing, failed });
}
