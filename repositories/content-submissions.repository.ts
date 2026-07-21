import type { TypedSupabaseClient } from "@/lib/supabase/types";

export type ContentStudioFocus = "leasehold_sales" | "occupancy" | "beauty";

export interface ContentSubmissionListFilters {
  branchId?: string;
  taskId?: string;
  contentFocus?: ContentStudioFocus;
}

/** Newest first, joined with the brief it was made for and who uploaded it -- RLS/open-read (see migration 0096), branch scoping is an app-layer filter here same as listKpiTasks. */
const SUBMISSION_BRIEF_SELECT =
  "*, task:task_id(title, description), beauty_content_item:beauty_content_item_id(title, hook, script_notes, cta), submitter:submitted_by(full_name)";

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
    .select("*, task:task_id(title, description), beauty_content_item:beauty_content_item_id(title, hook, script_notes, cta)")
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
  storage_path: string;
  public_url: string;
  caption: string | null;
  created_by: string;
}

export async function createContentSubmission(supabase: TypedSupabaseClient, input: CreateContentSubmissionInput) {
  const { data, error } = await supabase.from("markom_content_submissions").insert(input).select("id").single();
  if (error) throw error;
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

export async function deleteContentSubmission(supabase: TypedSupabaseClient, id: string) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["pending_review", "needs_revision", "approved"]);
  if (error) throw error;
}
