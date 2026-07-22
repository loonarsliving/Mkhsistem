"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { generateStoryboardFromBrief } from "@/lib/ai/domains/kontenai-storyboard";
import { createClient } from "@/lib/supabase/server";
import { getKontenAiCreativeBrief } from "@/repositories/kontenai-creative-briefs.repository";
import {
  createKontenAiStoryboard,
  getKontenAiStoryboard,
  listKontenAiStoryboards,
  updateKontenAiStoryboardScenes,
  type KontenAiStoryboardScene,
  type KontenAiStoryboardWithBrief,
} from "@/repositories/kontenai-storyboards.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiStoryboardRow } from "@/types/domain";

const STORYBOARD_ENGINE_PATH = "/kontenai/storyboard-engine";

function generateSceneId(): string {
  return `scene-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

/**
 * Storyboard Engine's core action: reads a Creative Brief (AI Director,
 * Sprint 3), asks Gemini to turn it into scene-by-scene storyboard, then
 * persists it -- mirroring generateCreativeBriefAction's "never throw,
 * always return a clear ActionResult" contract.
 */
export async function generateStoryboardAction(creativeBriefId: string): Promise<ActionResult<KontenAiStoryboardRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const brief = await getKontenAiCreativeBrief(supabase, creativeBriefId);

    const drafts = await generateStoryboardFromBrief({
      platform: brief.platform,
      objective: brief.objective,
      bigIdea: brief.big_idea,
      hook: brief.hook,
      keyMessage: brief.key_message,
      targetEmotion: brief.target_emotion,
      cta: brief.cta,
      contentAngle: brief.content_angle,
    });

    const scenes: KontenAiStoryboardScene[] = drafts.map((draft, index) => ({ ...draft, id: generateSceneId(), order: index }));

    const storyboard = await createKontenAiStoryboard(supabase, {
      creativeBriefId: brief.id,
      title: `Storyboard: ${brief.product_project}`,
      scenes,
      createdBy: session.userId,
    });

    revalidatePath(STORYBOARD_ENGINE_PATH);
    return actionSuccess(storyboard);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghasilkan storyboard");
  }
}

export async function listStoryboardsAction(): Promise<KontenAiStoryboardWithBrief[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiStoryboards(supabase);
}

export async function getStoryboardAction(storyboardId: string): Promise<KontenAiStoryboardWithBrief> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return getKontenAiStoryboard(supabase, storyboardId);
}

function validateScenes(scenes: KontenAiStoryboardScene[]): string | null {
  if (scenes.length === 0) return "Storyboard harus memiliki minimal 1 scene";
  for (const scene of scenes) {
    if (!scene.sceneTitle.trim()) return "Setiap scene harus memiliki Scene Title";
    if (!scene.visualDescription.trim()) return "Setiap scene harus memiliki Visual Description";
    if (!Number.isFinite(scene.durationSeconds) || scene.durationSeconds <= 0) return "Duration setiap scene harus lebih dari 0 detik";
  }
  return null;
}

/** Persists manual edits from the builder UI -- add, remove, reorder, or field edits all resolve to "save this full scene list". */
export async function saveStoryboardScenesAction(
  storyboardId: string,
  scenes: KontenAiStoryboardScene[],
): Promise<ActionResult<KontenAiStoryboardRow>> {
  const session = await requireKontenAiAccess();

  const validationError = validateScenes(scenes);
  if (validationError) return actionError(validationError);

  const supabase = await createClient();
  try {
    const storyboard = await updateKontenAiStoryboardScenes(supabase, storyboardId, scenes, session.userId);
    revalidatePath(STORYBOARD_ENGINE_PATH);
    return actionSuccess(storyboard);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menyimpan perubahan storyboard");
  }
}
