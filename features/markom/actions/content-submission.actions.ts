"use server";

import { revalidatePath } from "next/cache";

import { reviewContentSubmission } from "@/lib/ai/domains/markom";
import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createZernioPost, isZernioConfigured, listZernioAccounts, type ZernioProduct } from "@/lib/social/zernio";
import { createClient } from "@/lib/supabase/server";
import { fetchUrlAsBase64 } from "@/lib/utils/fetch-remote-file";
import {
  buildZernioMediaItems,
  createContentSubmission,
  deleteContentSubmission,
  getContentSubmission,
  listContentSubmissions,
  markContentPublished,
  markContentPublishedViaZernio,
  markContentPublishFailed,
  saveContentReview,
  scheduleContentSubmission,
  type ContentStudioFocus,
} from "@/repositories/content-submissions.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

const CONTENT_STUDIO_PATH = "/markom/content-studio";

/** Gemini's inline (non-Files-API) request body has a practical ~20MB ceiling -- a video under this is sent whole for a real watch-it review; anything bigger falls back to the caption/brief-only review (see reviewContentSubmission) rather than failing the whole submission. Content Studio itself allows uploads up to 50MB (MAX_CONTENT_SIZE_BYTES, content-studio-board.tsx), so this genuinely triggers for larger clips. */
const MAX_INLINE_VIDEO_REVIEW_BYTES = 19 * 1024 * 1024;

function productForFocus(focus: ContentStudioFocus): ZernioProduct {
  return focus === "beauty" ? "beauty" : "property";
}

/** Beauty's brief lives in loonars_content_items (hook/script/CTA), not a plain title+description like kpi_tasks -- folded into one description string so reviewContentSubmission's prompt shape stays the same for every focus. */
function beautyBriefDescription(item: { hook: string | null; script_notes: string | null; cta: string | null }): string | null {
  const parts = [item.hook && `Hook: ${item.hook}`, item.script_notes && `Catatan naskah: ${item.script_notes}`, item.cta && `CTA: ${item.cta}`].filter(Boolean);
  return parts.length > 0 ? parts.join(" | ") : null;
}

export async function listContentSubmissionsAction(contentFocus?: ContentStudioFocus) {
  await requireSession();
  const supabase = await createClient();
  return listContentSubmissions(supabase, { contentFocus });
}

interface CreateContentSubmissionInput {
  taskId?: string;
  beautyContentItemId?: string;
  contentFocus: ContentStudioFocus;
  platform: "instagram" | "tiktok";
  /** 1 item = single photo/video; 2-10 items = an image carousel (never a video). First item is always what ends up on the submission row itself (storage_path/public_url); the rest go into markom_content_submission_photos. */
  media: { storagePath: string; publicUrl: string }[];
  mediaType: "image" | "video";
  mimeType: string;
  caption?: string;
}

/**
 * Creates the submission row, then immediately runs the AI review
 * (reviewContentSubmission -- real Gemini vision for images, caption-only
 * for video) synchronously, the same pattern as submitTaskObstacleAction:
 * the write that matters most (the submission itself, and what Markom
 * uploaded) always succeeds first and independently; if the AI step then
 * fails, the row is left in 'pending_review' rather than losing the upload,
 * and retryContentReviewAction can be called to try again.
 *
 * taskId is optional -- only Leasehold/Villa use kpi_tasks. Beauty's brief
 * comes from beautyContentItemId (loonars_content_items, 0143) instead,
 * since Beauty has no branch/division-scoped checklist. branch_id/
 * division_id always come from the submitter's own employee record for
 * Beauty (loonars_content_items isn't branch-scoped either).
 */
export async function createContentSubmissionAction(input: CreateContentSubmissionInput): Promise<ActionResult<{ submissionId: string; aiReviewed: boolean }>> {
  const session = await requirePermission("content_submission.manage");
  const supabase = await createClient();

  if (input.media.length === 0) return actionError("Tidak ada foto/video yang diupload");
  if (input.media.length > 10) return actionError("Maksimal 10 foto untuk satu carousel");
  if (input.mediaType === "video" && input.media.length > 1) return actionError("Video tidak bisa digabung dengan file lain -- upload satu video saja");

  let taskTitle = "Konten mandiri (tanpa checklist)";
  let taskDescription: string | null = null;
  let branchId = session.employee.branch_id;
  let divisionId = session.employee.division_id;

  if (input.taskId) {
    const { data: task, error: taskError } = await supabase
      .from("kpi_tasks")
      .select("title, description, branch_id, division_id")
      .eq("id", input.taskId)
      .single();
    if (taskError || !task) return actionError("Task tidak ditemukan");
    taskTitle = task.title;
    taskDescription = task.description;
    branchId = task.branch_id;
    divisionId = task.division_id;
  } else if (input.beautyContentItemId) {
    const { data: item, error: itemError } = await supabase
      .from("loonars_content_items")
      .select("title, hook, script_notes, cta")
      .eq("id", input.beautyContentItemId)
      .single();
    if (itemError || !item) return actionError("Brief konten tidak ditemukan");
    taskTitle = item.title;
    taskDescription = beautyBriefDescription(item);
  }
  if (!divisionId) return actionError("Akun Anda belum terhubung ke divisi manapun -- hubungi admin");

  let submissionId: string;
  try {
    const inserted = await createContentSubmission(supabase, {
      task_id: input.taskId ?? null,
      beauty_content_item_id: input.beautyContentItemId ?? null,
      branch_id: branchId,
      division_id: divisionId,
      content_focus: input.contentFocus,
      platform: input.platform,
      submitted_by: session.userId,
      media_type: input.mediaType,
      storage_path: input.media[0].storagePath,
      public_url: input.media[0].publicUrl,
      extra_photos: input.media.slice(1).map((m) => ({ storage_path: m.storagePath, public_url: m.publicUrl })),
      caption: input.caption?.trim() || null,
      created_by: session.userId,
    });
    submissionId = inserted.id;
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan konten");
  }

  const aiReviewed = await runReviewAndSave(supabase, submissionId, {
    taskTitle,
    taskDescription,
    caption: input.caption ?? null,
    mediaType: input.mediaType,
    mediaUrl: input.media[0].publicUrl,
    mimeType: input.mimeType,
    contentFocus: input.contentFocus,
    platform: input.platform,
    updatedBy: session.userId,
  });

  revalidatePath(CONTENT_STUDIO_PATH);
  return actionSuccess({ submissionId, aiReviewed });
}

/** Re-runs the AI review on a submission still in 'pending_review' or 'needs_revision' -- for when the first attempt (at upload time) failed, e.g. a transient Gemini error, or after Markom edited the caption. */
export async function retryContentReviewAction(submissionId: string): Promise<ActionResult<{ aiReviewed: boolean }>> {
  const session = await requirePermission("content_submission.manage");
  const supabase = await createClient();

  const submission = await getContentSubmission(supabase, submissionId);
  const task = submission.task as { title?: string; description?: string | null } | null;
  const beautyItem = submission.beauty_content_item as { title?: string; hook: string | null; script_notes: string | null; cta: string | null } | null;

  const aiReviewed = await runReviewAndSave(supabase, submissionId, {
    taskTitle: task?.title ?? beautyItem?.title ?? "Konten mandiri (tanpa checklist)",
    taskDescription: task?.description ?? (beautyItem ? beautyBriefDescription(beautyItem) : null),
    caption: submission.caption,
    mediaType: submission.media_type,
    mediaUrl: submission.public_url,
    mimeType: submission.media_type === "image" ? "image/jpeg" : "video/mp4",
    contentFocus: submission.content_focus as ContentStudioFocus,
    platform: submission.platform as "instagram" | "tiktok",
    updatedBy: session.userId,
  });

  revalidatePath(CONTENT_STUDIO_PATH);
  return actionSuccess({ aiReviewed });
}

async function runReviewAndSave(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  input: {
    taskTitle: string;
    taskDescription: string | null;
    caption: string | null;
    mediaType: "image" | "video";
    mediaUrl: string;
    mimeType: string;
    contentFocus: ContentStudioFocus;
    platform: "instagram" | "tiktok";
    updatedBy: string;
  },
): Promise<boolean> {
  try {
    let imageBase64: string | undefined;
    let videoBase64: string | undefined;
    if (input.mediaType === "image") {
      imageBase64 = await fetchUrlAsBase64(input.mediaUrl);
    } else {
      // A too-large or unreachable video falls back to the caption-only
      // review path (reviewContentSubmission's videoBase64-undefined
      // branch) instead of failing the whole submission -- fetch errors
      // here are deliberately swallowed for the same reason imageBase64's
      // fetch failure would otherwise abort the outer try/catch.
      try {
        const base64 = await fetchUrlAsBase64(input.mediaUrl);
        const approxBytes = Math.ceil((base64.length * 3) / 4);
        if (approxBytes <= MAX_INLINE_VIDEO_REVIEW_BYTES) videoBase64 = base64;
      } catch {
        videoBase64 = undefined;
      }
    }

    const review = await reviewContentSubmission({
      taskTitle: input.taskTitle,
      taskDescription: input.taskDescription,
      caption: input.caption,
      mediaType: input.mediaType,
      imageBase64,
      imageMimeType: input.mimeType,
      videoBase64,
      videoMimeType: input.mimeType,
    });

    await saveContentReview(supabase, submissionId, {
      status: review.verdict,
      score: review.score,
      aiVerdict: review.feedback,
      updatedBy: input.updatedBy,
    });

    if (review.verdict === "approved") {
      await autoScheduleAfterApproval(supabase, submissionId, input.contentFocus, input.platform, input.updatedBy);
    }

    return true;
  } catch {
    // Left in 'pending_review' -- retryContentReviewAction can be called again.
    return false;
  }
}

/**
 * "AI akan menguplod berdasarkan waktunya" -- once a submission scores >=
 * 8.5 it's auto-scheduled for the platform+product's own best_upload_hour
 * (social_account_snapshots, captured daily by /api/social/capture-snapshots),
 * no manual "schedule" click. If that data isn't available yet (platform
 * just connected, no snapshot captured), falls back to scheduling 1 hour
 * from now so the submission doesn't get stuck -- the publish worker will
 * still pick it up right on schedule.
 */
async function autoScheduleAfterApproval(
  supabase: Awaited<ReturnType<typeof createClient>>,
  submissionId: string,
  contentFocus: ContentStudioFocus,
  platform: "instagram" | "tiktok",
  updatedBy: string,
) {
  const { data: snapshot } = await supabase
    .from("social_account_snapshots")
    .select("best_upload_hour")
    .eq("platform", platform)
    .eq("product_line", productForFocus(contentFocus))
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const target = new Date();
  const bestHour = snapshot?.best_upload_hour;
  if (bestHour !== null && bestHour !== undefined) {
    target.setUTCHours(bestHour, 0, 0, 0);
    if (target.getTime() <= Date.now()) target.setUTCDate(target.getUTCDate() + 1);
  } else {
    target.setTime(Date.now() + 60 * 60 * 1000);
  }

  await scheduleContentSubmission(supabase, submissionId, target.toISOString(), updatedBy);
}

/** Manual override for when Zernio isn't connected yet for this platform/product -- Markom posts it themselves in the real app and confirms here. The normal path is the automatic Zernio publish (app/api/social/publish-content). */
export async function markContentPublishedAction(submissionId: string): Promise<ActionResult> {
  const session = await requirePermission("content_submission.manage");
  const supabase = await createClient();

  const submission = await getContentSubmission(supabase, submissionId);
  if (submission.status !== "approved" && submission.status !== "scheduled") {
    return actionError("Hanya konten yang sudah disetujui AI yang bisa ditandai selesai");
  }

  try {
    await markContentPublished(supabase, submissionId, session.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menandai konten selesai");
  }

  revalidatePath(CONTENT_STUDIO_PATH);
  return actionSuccess();
}

/**
 * Immediate manual publish, bypassing the scheduled best-hour wait --
 * useful right after a submission scores >= 8.5 if Markom wants it live
 * now instead of waiting for the auto-scheduled time. Reuses the same
 * Zernio call the publish worker makes.
 */
export async function publishContentNowAction(submissionId: string): Promise<ActionResult> {
  await requirePermission("content_submission.manage");
  const supabase = await createClient();

  const submission = await getContentSubmission(supabase, submissionId);
  if (submission.status !== "scheduled") return actionError("Hanya konten berstatus terjadwal yang bisa langsung ditayangkan");

  const contentFocus = submission.content_focus as ContentStudioFocus;
  const platform = submission.platform as "instagram" | "tiktok";
  const product = productForFocus(contentFocus);

  if (!isZernioConfigured(product)) return actionError("Zernio belum dikonfigurasi untuk product line ini");

  try {
    const accounts = await listZernioAccounts(platform, product);
    const account = accounts[0];
    if (!account) return actionError(`Belum ada akun ${platform} yang terhubung ke Zernio untuk product line ini`);

    const result = await createZernioPost(
      { accountId: account.id, platform, media: buildZernioMediaItems(submission), caption: submission.caption },
      product,
    );
    await markContentPublishedViaZernio(supabase, submissionId, {
      zernioAccountId: account.id,
      zernioPostId: result.postId,
      zernioPublishStatus: result.status,
      zernioPermalink: result.permalink,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Zernio publish gagal";
    await markContentPublishFailed(supabase, submissionId, reason);
    revalidatePath(CONTENT_STUDIO_PATH);
    return actionError(reason);
  }

  revalidatePath(CONTENT_STUDIO_PATH);
  return actionSuccess();
}

export async function deleteContentSubmissionAction(submissionId: string): Promise<ActionResult> {
  await requirePermission("content_submission.manage");
  const supabase = await createClient();
  try {
    await deleteContentSubmission(supabase, submissionId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus konten");
  }
  revalidatePath(CONTENT_STUDIO_PATH);
  return actionSuccess();
}
