import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { PublishPlatform } from "@/lib/publishing/platform-adapters";
import type { KontenAiPublishScheduleRow } from "@/types/domain";

export type KontenAiPublishStatus = "draft" | "scheduled" | "published" | "failed";

export interface KontenAiPublishScheduleWithContext extends KontenAiPublishScheduleRow {
  renderJob: { output_public_url: string | null; storyboard: { title: string } | null } | null;
}

const SELECT_COLUMNS =
  "id, render_job_id, platform, caption, hashtags, scheduled_at, status, published_at, external_post_id, external_post_url, error_message, created_by, created_at, updated_at, renderJob:render_job_id(output_public_url, storyboard:storyboard_id(title))";

function deriveStatus(status: KontenAiPublishStatus | undefined, scheduledAt: string | null): KontenAiPublishStatus {
  if (status) return status;
  return scheduledAt ? "scheduled" : "draft";
}

export interface CreateKontenAiPublishScheduleInput {
  renderJobId: string;
  platform: PublishPlatform;
  caption: string;
  hashtags: string[];
  scheduledAt: string | null;
  createdBy: string;
}

export async function createKontenAiPublishSchedule(
  supabase: TypedSupabaseClient,
  input: CreateKontenAiPublishScheduleInput,
): Promise<KontenAiPublishScheduleRow> {
  const { data, error } = await supabase
    .from("kontenai_publish_schedules")
    .insert({
      render_job_id: input.renderJobId,
      platform: input.platform,
      caption: input.caption,
      hashtags: input.hashtags,
      scheduled_at: input.scheduledAt,
      status: deriveStatus(undefined, input.scheduledAt),
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiPublishScheduleRow;
}

export interface UpdateKontenAiPublishScheduleInput {
  platform?: PublishPlatform;
  caption?: string;
  hashtags?: string[];
  scheduledAt?: string | null;
}

/** Editing a draft/scheduled entry -- if scheduledAt becomes set, status advances from 'draft' to 'scheduled' automatically (and back to 'draft' if cleared), matching the Content Calendar's status column. */
export async function updateKontenAiPublishSchedule(
  supabase: TypedSupabaseClient,
  id: string,
  input: UpdateKontenAiPublishScheduleInput,
): Promise<KontenAiPublishScheduleRow> {
  const { data, error } = await supabase
    .from("kontenai_publish_schedules")
    .update({
      ...(input.platform !== undefined ? { platform: input.platform } : {}),
      ...(input.caption !== undefined ? { caption: input.caption } : {}),
      ...(input.hashtags !== undefined ? { hashtags: input.hashtags } : {}),
      ...(input.scheduledAt !== undefined ? { scheduled_at: input.scheduledAt, status: deriveStatus(undefined, input.scheduledAt) } : {}),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiPublishScheduleRow;
}

export async function markKontenAiPublishScheduleResult(
  supabase: TypedSupabaseClient,
  id: string,
  input: { success: boolean; externalPostId?: string; externalPostUrl?: string; error?: string },
): Promise<KontenAiPublishScheduleRow> {
  const { data, error } = await supabase
    .from("kontenai_publish_schedules")
    .update(
      input.success
        ? {
            status: "published",
            published_at: new Date().toISOString(),
            external_post_id: input.externalPostId ?? null,
            external_post_url: input.externalPostUrl ?? null,
            error_message: null,
          }
        : { status: "failed", error_message: input.error?.slice(0, 500) ?? "Gagal publish" },
    )
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiPublishScheduleRow;
}

export async function getKontenAiPublishSchedule(supabase: TypedSupabaseClient, id: string): Promise<KontenAiPublishScheduleWithContext> {
  const { data, error } = await supabase.from("kontenai_publish_schedules").select(SELECT_COLUMNS).eq("id", id).single();
  if (error) throw error;
  return data as unknown as KontenAiPublishScheduleWithContext;
}

/** Content Calendar's data source -- every schedule (draft, scheduled, published, failed), newest scheduled date first. */
export async function listKontenAiPublishSchedules(supabase: TypedSupabaseClient, limit = 100): Promise<KontenAiPublishScheduleWithContext[]> {
  const { data, error } = await supabase
    .from("kontenai_publish_schedules")
    .select(SELECT_COLUMNS)
    .order("scheduled_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as KontenAiPublishScheduleWithContext[];
}
