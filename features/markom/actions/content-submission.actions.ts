"use server";

import { revalidatePath } from "next/cache";

import { reviewContentSubmission } from "@/lib/ai/domains/markom";
import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { fetchUrlAsBase64 } from "@/lib/utils/fetch-remote-file";
import {
  createContentSubmission,
  deleteContentSubmission,
  getContentSubmission,
  listContentSubmissions,
  markContentPublished,
  saveContentReview,
  scheduleContentSubmission,
} from "@/repositories/content-submissions.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

export async function listContentSubmissionsAction(taskId?: string) {
  await requireSession();
  const supabase = await createClient();
  return listContentSubmissions(supabase, { taskId });
}

interface CreateContentSubmissionInput {
  taskId: string;
  storagePath: string;
  publicUrl: string;
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
 */
export async function createContentSubmissionAction(input: CreateContentSubmissionInput): Promise<ActionResult<{ submissionId: string; aiReviewed: boolean }>> {
  const session = await requirePermission("content_submission.manage");
  const supabase = await createClient();

  const { data: task, error: taskError } = await supabase.from("kpi_tasks").select("title, description, branch_id, division_id").eq("id", input.taskId).single();
  if (taskError || !task) return actionError("Task tidak ditemukan");

  let submissionId: string;
  try {
    const inserted = await createContentSubmission(supabase, {
      task_id: input.taskId,
      branch_id: task.branch_id,
      division_id: task.division_id,
      submitted_by: session.userId,
      media_type: input.mediaType,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      caption: input.caption?.trim() || null,
      created_by: session.userId,
    });
    submissionId = inserted.id;
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan konten");
  }

  const aiReviewed = await runReviewAndSave(supabase, submissionId, {
    taskTitle: task.title,
    taskDescription: task.description,
    caption: input.caption ?? null,
    mediaType: input.mediaType,
    mediaUrl: input.publicUrl,
    mimeType: input.mimeType,
    updatedBy: session.userId,
  });

  revalidatePath("/markom/content-submissions");
  return actionSuccess({ submissionId, aiReviewed });
}

/** Re-runs the AI review on a submission still in 'pending_review' -- for when the first attempt (at upload time) failed, e.g. a transient Gemini error. */
export async function retryContentReviewAction(submissionId: string): Promise<ActionResult<{ aiReviewed: boolean }>> {
  const session = await requirePermission("content_submission.manage");
  const supabase = await createClient();

  const submission = await getContentSubmission(supabase, submissionId);
  const task = submission.task as { title?: string; description?: string | null } | null;

  const aiReviewed = await runReviewAndSave(supabase, submissionId, {
    taskTitle: task?.title ?? "-",
    taskDescription: task?.description ?? null,
    caption: submission.caption,
    mediaType: submission.media_type,
    mediaUrl: submission.public_url,
    mimeType: submission.media_type === "image" ? "image/jpeg" : "video/mp4",
    updatedBy: session.userId,
  });

  revalidatePath("/markom/content-submissions");
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
    updatedBy: string;
  },
): Promise<boolean> {
  try {
    let imageBase64: string | undefined;
    if (input.mediaType === "image") {
      imageBase64 = await fetchUrlAsBase64(input.mediaUrl);
    }

    const review = await reviewContentSubmission({
      taskTitle: input.taskTitle,
      taskDescription: input.taskDescription,
      caption: input.caption,
      mediaType: input.mediaType,
      imageBase64,
      imageMimeType: input.mimeType,
    });

    await saveContentReview(supabase, submissionId, {
      status: review.verdict,
      aiVerdict: review.feedback,
      updatedBy: input.updatedBy,
    });
    return true;
  } catch {
    // Left in 'pending_review' -- retryContentReviewAction can be called again.
    return false;
  }
}

/**
 * Reads social_account_snapshots' most recent real Instagram best_upload_hour
 * and schedules a WhatsApp reminder for the next occurrence of that hour --
 * the 5-minute worker (app/api/social/publish-content) sends the actual
 * reminder, not this action. Markom still posts manually in the real
 * Instagram app (the company's IG isn't connected to Meta Business, see
 * that route's doc comment) and confirms via markContentPublishedAction.
 */
export async function scheduleAtBestHourAction(submissionId: string): Promise<ActionResult> {
  const session = await requirePermission("content_submission.manage");
  const supabase = await createClient();

  const submission = await getContentSubmission(supabase, submissionId);
  if (submission.status !== "approved") return actionError("Hanya konten yang sudah disetujui AI yang bisa dijadwalkan");

  const { data: snapshot } = await supabase
    .from("social_account_snapshots")
    .select("best_upload_hour")
    .eq("platform", "instagram")
    .eq("product_line", "property")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const bestHour = snapshot?.best_upload_hour;
  if (bestHour === null || bestHour === undefined) {
    return actionError("Data jam upload terbaik belum tersedia -- coba lagi setelah snapshot Instagram berikutnya, atau posting manual sekarang lalu tandai selesai.");
  }

  const target = new Date();
  target.setUTCHours(bestHour, 0, 0, 0);
  if (target.getTime() <= Date.now()) target.setUTCDate(target.getUTCDate() + 1);

  try {
    await scheduleContentSubmission(supabase, submissionId, target.toISOString(), session.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menjadwalkan konten");
  }

  revalidatePath("/markom/content-submissions");
  return actionSuccess();
}

/** Markom's own confirmation after posting the content manually in the real Instagram app -- available as soon as AI has approved it, whether or not a best-hour reminder was scheduled first. */
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

  revalidatePath("/markom/content-submissions");
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
  revalidatePath("/markom/content-submissions");
  return actionSuccess();
}
