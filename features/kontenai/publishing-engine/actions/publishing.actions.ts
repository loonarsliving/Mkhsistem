"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { generatePublishingCopy } from "@/lib/ai/domains/kontenai-publishing";
import { getPlatformAdapter, PUBLISH_PLATFORMS, type PublishPlatform } from "@/lib/publishing/platform-adapters";
import { createClient } from "@/lib/supabase/server";
import { getKontenAiCreativeBrief } from "@/repositories/kontenai-creative-briefs.repository";
import {
  createKontenAiPublishSchedule,
  getKontenAiPublishSchedule,
  listKontenAiPublishSchedules,
  markKontenAiPublishScheduleResult,
  updateKontenAiPublishSchedule,
  type KontenAiPublishScheduleWithContext,
  type UpdateKontenAiPublishScheduleInput,
} from "@/repositories/kontenai-publish-schedules.repository";
import { getKontenAiRenderJob, listCompletedKontenAiRenderJobs, type KontenAiRenderJobWithStoryboard } from "@/repositories/kontenai-render-jobs.repository";
import { getKontenAiStoryboard } from "@/repositories/kontenai-storyboards.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiPublishScheduleRow } from "@/types/domain";

const PUBLISHING_ENGINE_PATH = "/kontenai/publishing-engine";

/** Step 1: "Ambil video hasil Render Engine" -- only completed renders are eligible sources. */
export async function listCompletedRenderJobsAction(): Promise<KontenAiRenderJobWithStoryboard[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listCompletedKontenAiRenderJobs(supabase);
}

/** Steps 2-3: generates caption + hashtags for a render job's video, reasoning over the same Creative Brief AI Director produced for its storyboard. Not persisted yet -- a preview the user can edit before saving. */
export async function generatePublishingCopyAction(renderJobId: string, platform: PublishPlatform): Promise<ActionResult<{ caption: string; hashtags: string[] }>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const renderJob = await getKontenAiRenderJob(supabase, renderJobId);
    if (renderJob.status !== "completed") return actionError("Render job ini belum selesai -- pilih video yang sudah completed");

    const storyboard = await getKontenAiStoryboard(supabase, renderJob.storyboard_id);
    const brief = await getKontenAiCreativeBrief(supabase, storyboard.creative_brief_id);

    const copy = await generatePublishingCopy({
      platform,
      productProject: brief.product_project,
      bigIdea: brief.big_idea,
      hook: brief.hook,
      keyMessage: brief.key_message,
      targetEmotion: brief.target_emotion,
      cta: brief.cta,
      contentAngle: brief.content_angle,
    });

    return actionSuccess(copy);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghasilkan caption & hashtag");
  }
}

export interface CreatePublishScheduleActionInput {
  renderJobId: string;
  platform: PublishPlatform;
  caption: string;
  hashtags: string[];
  /** ISO datetime, or null to save as Draft without a publish time yet. */
  scheduledAt: string | null;
}

/** Steps 4-6: saves the platform, caption/hashtags, and (optional) publish date/time -- status is derived automatically (draft without a date, scheduled with one). */
export async function createPublishScheduleAction(input: CreatePublishScheduleActionInput): Promise<ActionResult<KontenAiPublishScheduleRow>> {
  const session = await requireKontenAiAccess();

  if (!PUBLISH_PLATFORMS.includes(input.platform)) return actionError("Platform tidak valid");
  const caption = input.caption.trim();
  if (!caption) return actionError("Caption tidak boleh kosong");
  const hashtags = input.hashtags.map((tag) => tag.trim()).filter(Boolean);
  if (input.scheduledAt && Number.isNaN(new Date(input.scheduledAt).getTime())) return actionError("Tanggal/jam publish tidak valid");

  const supabase = await createClient();
  try {
    const renderJob = await getKontenAiRenderJob(supabase, input.renderJobId);
    if (renderJob.status !== "completed") return actionError("Render job ini belum selesai -- pilih video yang sudah completed");

    const schedule = await createKontenAiPublishSchedule(supabase, {
      renderJobId: input.renderJobId,
      platform: input.platform,
      caption,
      hashtags,
      scheduledAt: input.scheduledAt,
      createdBy: session.userId,
    });

    revalidatePath(PUBLISHING_ENGINE_PATH);
    return actionSuccess(schedule);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menyimpan jadwal publish");
  }
}

export async function updatePublishScheduleAction(
  id: string,
  input: UpdateKontenAiPublishScheduleInput,
): Promise<ActionResult<KontenAiPublishScheduleRow>> {
  await requireKontenAiAccess();

  if (input.caption !== undefined && !input.caption.trim()) return actionError("Caption tidak boleh kosong");
  if (input.scheduledAt && Number.isNaN(new Date(input.scheduledAt).getTime())) return actionError("Tanggal/jam publish tidak valid");

  const supabase = await createClient();
  try {
    const schedule = await updateKontenAiPublishSchedule(supabase, id, input);
    revalidatePath(PUBLISHING_ENGINE_PATH);
    return actionSuccess(schedule);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal memperbarui jadwal publish");
  }
}

/**
 * Step 9's "struktur integrasi" in action: routes to the destination
 * platform's adapter (lib/publishing/platform-adapters.ts). Every adapter
 * is a stub this sprint, so this always records a 'failed' outcome with a
 * clear reason -- but the call path (schedule -> adapter -> status update)
 * is the real structure a future sprint's live integration will use as-is.
 */
export async function publishNowAction(scheduleId: string): Promise<ActionResult<KontenAiPublishScheduleRow>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const schedule = await getKontenAiPublishSchedule(supabase, scheduleId);
    const videoUrl = schedule.renderJob?.output_public_url;
    if (!videoUrl) return actionError("Video hasil render untuk jadwal ini tidak ditemukan");

    const adapter = getPlatformAdapter(schedule.platform);
    const result = await adapter.publish({ videoUrl, caption: schedule.caption, hashtags: schedule.hashtags });

    const updated = await markKontenAiPublishScheduleResult(supabase, scheduleId, result);
    revalidatePath(PUBLISHING_ENGINE_PATH);
    return actionSuccess(updated);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal memproses publish");
  }
}

/** Content Calendar's data source. */
export async function listPublishSchedulesAction(): Promise<KontenAiPublishScheduleWithContext[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiPublishSchedules(supabase);
}
