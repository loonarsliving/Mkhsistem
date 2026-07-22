import { NextResponse } from "next/server";

import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { logger } from "@/lib/logger";
import { createZernioPost, isZernioConfigured, listZernioAccounts, type ZernioProduct } from "@/lib/social/zernio";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildZernioMediaItems, markContentPublishedViaZernio, markContentPublishFailed } from "@/repositories/content-submissions.repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** How many due submissions this single 5-minute tick publishes -- a sane batch cap, not a pacing concern. */
const BATCH_SIZE = 10;

function productForFocus(focus: string): ZernioProduct {
  return focus === "beauty" ? "beauty" : "property";
}

/**
 * Publish worker for markom_content_submissions (Content Studio, 0142) --
 * triggered every 5 minutes by pg_cron (markom-content-publish-worker,
 * 0096), same deliberately-separate-from-scheduling pattern as
 * /api/crm/dispatch-promo-sends.
 *
 * Supersedes 0097's manual-WhatsApp-reminder flow now that Zernio (0126)
 * gives a real publish API for both product lines: at scheduled_publish_at,
 * actually calls Zernio's createPost (publishNow: true) against the
 * connected account for that submission's platform+product, then records
 * the result as 'published' or 'failed'.
 *
 * Rows are processed one at a time in a plain for-loop, never
 * Promise.all'd, even when a batch mixes property and beauty rows -- see
 * lib/social/zernio.ts's module doc for why two products' Zernio clients
 * must never be constructed concurrently.
 */
export async function POST() {
  const supabase = createAdminClient();

  const { data: due, error } = await supabase
    .from("markom_content_submissions")
    .select("id, media_type, caption, public_url, content_focus, platform, submitted_by, photos:markom_content_submission_photos(public_url, display_order)")
    .eq("status", "scheduled")
    .lte("scheduled_publish_at", new Date().toISOString())
    .order("scheduled_publish_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    logger.error("publish-content: failed to load due submissions", { error: error.message });
    return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
  }

  let published = 0;
  let failed = 0;

  for (const row of due ?? []) {
    const product = productForFocus(row.content_focus);
    const platform = row.platform as "instagram" | "tiktok";

    try {
      if (!isZernioConfigured(product)) throw new Error(`Zernio belum dikonfigurasi untuk product line ${product}`);

      const accounts = await listZernioAccounts(platform, product);
      const account = accounts[0];
      if (!account) throw new Error(`Belum ada akun ${platform} yang terhubung ke Zernio untuk product line ${product}`);

      const result = await createZernioPost(
        { accountId: account.id, platform, media: buildZernioMediaItems(row), caption: row.caption },
        product,
      );
      await markContentPublishedViaZernio(supabase, row.id, {
        zernioAccountId: account.id,
        zernioPostId: result.postId,
        zernioPublishStatus: result.status,
        zernioPermalink: result.permalink,
      });
      published += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("publish-content: publish failed", { submissionId: row.id, error: message });
      await markContentPublishFailed(supabase, row.id, message);

      const { data: employee } = await supabase.from("employees").select("phone").eq("id", row.submitted_by).maybeSingle();
      const body = `Gagal menayangkan konten Anda ke ${row.platform === "instagram" ? "Instagram" : "TikTok"} secara otomatis: ${message}. Coba tayangkan manual atau hubungi admin.`;
      if (employee?.phone) await sendWhatsAppText(employee.phone, body).catch(() => undefined);
      await supabase.from("mkc_notifications").insert({
        user_id: row.submitted_by,
        type: "crm",
        category: "content_publish_failed",
        title: "Gagal menayangkan konten",
        body,
        link: "/markom/content-studio",
      });

      failed += 1;
    }
  }

  return NextResponse.json({ status: "done", dueCount: (due ?? []).length, published, failed });
}
