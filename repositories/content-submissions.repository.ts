import type { TypedSupabaseClient } from "@/lib/supabase/types";

export interface ContentSubmissionListFilters {
  branchId?: string;
  taskId?: string;
}

/** Newest first, joined with the brief it was made for and who uploaded it -- RLS/open-read (see migration 0096), branch scoping is an app-layer filter here same as listKpiTasks. */
export async function listContentSubmissions(supabase: TypedSupabaseClient, filters: ContentSubmissionListFilters = {}) {
  let query = supabase
    .from("markom_content_submissions")
    .select("*, task:task_id(title, description), submitter:submitted_by(full_name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.taskId) query = query.eq("task_id", filters.taskId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getContentSubmission(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await supabase.from("markom_content_submissions").select("*, task:task_id(title, description)").eq("id", id).single();
  if (error) throw error;
  return data;
}

export interface CreateContentSubmissionInput {
  task_id: string;
  branch_id: string;
  division_id: string;
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

export async function saveContentReview(
  supabase: TypedSupabaseClient,
  id: string,
  review: { status: "approved" | "needs_revision"; aiVerdict: string; updatedBy: string },
) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ status: review.status, ai_verdict: review.aiVerdict, ai_reviewed_at: new Date().toISOString(), updated_by: review.updatedBy })
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

/** Markom's own confirmation that they posted this manually in the real Instagram app -- see app/api/social/publish-content/route.ts's doc comment for why this isn't automated. */
export async function markContentPublished(supabase: TypedSupabaseClient, id: string, updatedBy: string) {
  const { error } = await supabase
    .from("markom_content_submissions")
    .update({ status: "published", published_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("id", id)
    .in("status", ["approved", "scheduled"]);
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
