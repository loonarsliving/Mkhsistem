"use server";

import { revalidatePath } from "next/cache";

import { generateCreativeBriefAction } from "@/features/kontenai/ai-director/actions/creative-brief.actions";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { runAssetSelectionAction } from "@/features/kontenai/asset-selector/actions/select-assets.actions";
import { createRenderJobAction } from "@/features/kontenai/render-engine/actions/render-storyboard.actions";
import { generateStoryboardAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";
import { BEAUTY_TARGET_AUDIENCE, beautyObjectiveForCategory, buildBeautyCampaignGoal } from "@/lib/kontenai/beauty-brief-input";
import { createClient } from "@/lib/supabase/server";
import { updateContentItem } from "@/repositories/loonars-beauty.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

const BEAUTY_CONTENT_PATH = "/loonars-beauty";

export interface SendContentItemToKontenAiResult {
  creativeBriefId: string;
  storyboardId: string;
  renderQueued: boolean;
  pendingVideoGenerationCount: number;
}

/**
 * "Kirim ke KontenAI" -- takes a Loonars Beauty content brief (hook/caption/
 * script_notes/cta, still text-only, from loonars_content_items) and
 * threads it through KontenAI's real production pipeline (AI Director ->
 * Storyboard Engine -> Asset Selector -> Render Engine) instead of the team
 * shooting it manually.
 *
 * Any scene Asset Selector can't confidently match against the Asset
 * Library gets a Veo video-generation job queued (see
 * runAssetSelectionAction) -- the render job is only queued here if every
 * scene already has a confident asset; otherwise scripts/veo-worker.ts
 * queues it automatically once every pending scene resolves, so this
 * bridge never has to wait around for a multi-minute Veo generation.
 */
export async function sendContentItemToKontenAiAction(contentItemId: string): Promise<ActionResult<SendContentItemToKontenAiResult>> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  try {
    const { data: item, error } = await supabase.from("loonars_content_items").select("*").eq("id", contentItemId).single();
    if (error) throw error;
    if (item.kontenai_creative_brief_id) return actionError("Konten ini sudah pernah dikirim ke KontenAI");

    const briefResult = await generateCreativeBriefAction({
      objective: beautyObjectiveForCategory(item.category),
      platform: item.platform,
      targetAudience: BEAUTY_TARGET_AUDIENCE,
      productProject: item.product_name,
      campaignGoal: buildBeautyCampaignGoal(item),
      contentFocus: "beauty",
    });
    if (!briefResult.success) return actionError(briefResult.error ?? "Gagal membuat Creative Brief");
    const brief = briefResult.data!.brief;

    const storyboardResult = await generateStoryboardAction(brief.id);
    if (!storyboardResult.success) return actionError(storyboardResult.error ?? "Gagal membuat Storyboard");
    const storyboard = storyboardResult.data!;

    const selectionResult = await runAssetSelectionAction(storyboard.id);
    if (!selectionResult.success) return actionError(selectionResult.error ?? "Gagal menjalankan Asset Selector");
    const { queuedVideoGenerationCount } = selectionResult.data!;

    let renderQueued = false;
    if (queuedVideoGenerationCount === 0) {
      const renderResult = await createRenderJobAction(storyboard.id);
      renderQueued = renderResult.success;
    }

    await updateContentItem(supabase, contentItemId, { kontenai_creative_brief_id: brief.id, status: "draft" });

    revalidatePath(BEAUTY_CONTENT_PATH);
    return actionSuccess({
      creativeBriefId: brief.id,
      storyboardId: storyboard.id,
      renderQueued,
      pendingVideoGenerationCount: queuedVideoGenerationCount,
    });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal mengirim konten ke KontenAI");
  }
}
