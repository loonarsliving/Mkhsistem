import type { TypedSupabaseClient } from "@/lib/supabase/types";

export type ContentStudioFocus = "leasehold_sales" | "occupancy" | "beauty";

export interface ContentSubmissionListFilters {
  branchId?: string;
  taskId?: string;
  contentFocus?: ContentStudioFocus;
}

/** Newest first, joined with the brief it was made for, who uploaded it, and any 2nd-onward carousel photos (0158 -- storage_path/public_url on the row itself is always photo #1 / the single video) -- RLS/open-read (see migration 0096), branch scoping is an app-layer filter here same as listKpiTasks. */
const SUBMISSION_BRIEF_SELECT =
  "*, task:task_id(title, description), beauty_content_item:beauty_content_item_id(title, hook, script_notes, cta), submitter:submitted_by(full_name), photos:markom_content_submission_photos(storage_path, public_url, display_order)";

export async function listContentSubmissions(supabase: TypedSupabaseClient, filters: ContentSubmissionListFilters = {}) {
  let query = supabase.from("markom_content_submissions").select(SUBMISSION_BRIEF_SELECT).is("deleted_at", null).order("created_at", { ascending: false });

  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.taskId) query = query.eq("task_id", filters.taskId);
  if (filters.contentFocus) query = query.eq("content_focus", filters.contentFocus);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getContentSubmission(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("markom_content_submissions")
    .select(
      "*, task:task_id(title, description), beauty_content_item:beauty_content_item_id(title, hook, script_notes, cta), photos:markom_content_submission_photos(storage_path, public_url, display_order)",
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data;
}

export interface CreateContentSubmissionInput {
  task_id: string | null;
  beauty_content_item_id: string | null;
  branch_id: string;
  division_id: string;
  content_focus: ContentStudioFocus;
  platform: "instagram" | "tiktok";
  submitted_by: string;
  media_type: "image" | "video";
  /** Photo #1, or the single video -- kept on the row itself for backward compatibility with every existing single-media submission and all the display code reading it directly. */
  storage_path: string;
  public_url: string;
  /** Photo #2 onward for an image carousel (0158) -- always empty for a video submission, never mixed with one. */
  extra_photos?: { storage_path: string; public_url: string }[];
  caption: string | null;
  created_by: string;
}

export async function createContentSubmission(supabase: TypedSupabaseClient, input: CreateContentSubmissionInput) {
  const { extra_photos, ...row } = input;
  const { data, error } = await supabase.from("markom_content_submissions").insert(row).select("id").single();
  if (error) throw error;

  if (extra_photos && extra_photos.length > 0) {
    const { error: photosError } = await supabase.from("markom_content_submission_photos").insert(
      extra_photos.map((p, index) => ({
        submission_id: data.id,
        storage_path: p.storage_path,
        public_url: p.public_url,
        display_order: index + 1,
      })),
    );
    if (photosError) throw photosError;
  }

  return data;
}

/** Records the AI's verdict + numeric score. Auto-scheduling (score >= 8.5) is a separate follow-up call (scheduleContentSubmission) made by the action layer right after this, since it needs a best_upload_hour lookup this repository function doesn't have. */
export async function saveContentReview(
  supabase: TypedSupabaseClient,
  id: string,
  review: { status: "approved" | "needs_revision"; score: number; aiVerdict: string; updatedBy: string },
) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({
      status: review.status,
      ai_score: review.score,
      ai_verdict: review.aiVerdict,
      ai_reviewed_at: new Date().toISOString(),
      updated_by: review.updatedBy,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function scheduleContentSubmission(supabase: TypedSupabaseClient, id: string, scheduledPublishAt: string, updatedBy: string) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ status: "scheduled", scheduled_publish_at: scheduledPublishAt, updated_by: updatedBy })
    .eq("id", id)
    .eq("status", "approved");
  if (error) throw error;
}

/** Manual override -- lets Markom mark something published by hand (e.g. Zernio account not connected yet for that platform/product). The normal path is markContentPublishedViaZernio, called by the publish worker. */
export async function markContentPublished(supabase: TypedSupabaseClient, id: string, updatedBy: string) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ status: "published", published_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("id", id)
    .in("status", ["approved", "scheduled"]);
  if (error) throw error;
}

/** Real auto-publish path -- app/api/social/publish-content calls this once Zernio confirms the post went out. */
export async function markContentPublishedViaZernio(
  supabase: TypedSupabaseClient,
  id: string,
  result: { zernioAccountId: string; zernioPostId: string; zernioPublishStatus: string | null; zernioPermalink: string | null },
) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      zernio_account_id: result.zernioAccountId,
      zernio_post_id: result.zernioPostId,
      zernio_publish_status: result.zernioPublishStatus,
      zernio_permalink: result.zernioPermalink,
    })
    .eq("id", id)
    .eq("status", "scheduled");
  if (error) throw error;
}

export async function markContentPublishFailed(supabase: TypedSupabaseClient, id: string, failureReason: string) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ status: "failed", failure_reason: failureReason })
    .eq("id", id)
    .eq("status", "scheduled");
  if (error) throw error;
}

/**
 * markContentPublishedViaZernio marks a submission 'published' the instant
 * Zernio's createPost call is *accepted* -- but Zernio's own platformPostUrl
 * often isn't populated yet at that point (its own SDK docs say so), and its
 * per-platform status can still read 'pending'/'publishing' well after our
 * row already says 'published'. This reconciles that gap by re-polling
 * Zernio (getZernioPostStatus) for a submission already marked published and
 * updating zernio_publish_status/zernio_permalink with what's actually true
 * now -- or flips it to 'failed' if Zernio itself reports the platform
 * publish failed (something markContentPublishFailed can't do, since it's
 * scoped to status='scheduled', a different transition than this one).
 */
export async function reconcileZernioPublishStatus(
  supabase: TypedSupabaseClient,
  id: string,
  result: { zernioPublishStatus: string | null; zernioPermalink: string | null; failed: boolean; failureReason?: string },
) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update(
      result.failed
        ? { status: "failed", failure_reason: result.failureReason ?? "Zernio melaporkan publish gagal", zernio_publish_status: result.zernioPublishStatus }
        : { zernio_publish_status: result.zernioPublishStatus, zernio_permalink: result.zernioPermalink },
    )
    .eq("id", id)
    .eq("status", "published");
  if (error) throw error;
}

/** Builds Zernio's mediaItems array (0158) -- photo #1/the single video is always the parent row's own public_url/media_type; any 2nd-onward carousel photos come sorted by display_order. Shared by the manual "Tayangkan Sekarang" action and the 5-minute publish worker so both post the exact same carousel. */
export function buildZernioMediaItems(row: {
  public_url: string;
  media_type: string;
  photos?: { public_url: string; display_order: number }[] | null;
}): { url: string; type: "image" | "video" }[] {
  if (row.media_type === "video") return [{ url: row.public_url, type: "video" }];
  const extra = (row.photos ?? [])
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((p) => ({ url: p.public_url, type: "image" as const }));
  return [{ url: row.public_url, type: "image" as const }, ...extra];
}

/** Owner's call: once a video has actually been published somewhere (Zernio or manual), there's no more reason to keep the original file taking up Storage -- unlike photos (small, kept for the carousel/history display), videos are the bulk of Content Studio's storage footprint. Best-effort: called right after a submission flips to 'published', never blocks or fails the publish itself if the delete errors (e.g. already gone). storage_path/public_url stay on the row for history/audit even after the underlying object is gone. */
export async function deleteSubmissionVideoFromStorage(supabase: TypedSupabaseClient, storagePath: string): Promise<void> {
  await supabase.storage.from("markom-content-submissions").remove([storagePath]);
}

export async function deleteContentSubmission(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending_review", "needs_revision", "approved"]);
  if (error) throw error;
}
