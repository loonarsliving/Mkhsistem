"use server";

import { revalidatePath } from "next/cache";

import { generateCreativeBriefAction } from "@/features/kontenai/ai-director/actions/creative-brief.actions";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { runAssetSelectionAction } from "@/features/kontenai/asset-selector/actions/select-assets.actions";
import { createRenderJobAction } from "@/features/kontenai/render-engine/actions/render-storyboard.actions";
import { generateStoryboardAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";
import { createClient } from "@/lib/supabase/server";
import { updateContentItem } from "@/repositories/loonars-beauty.repository";
import type { Tables } from "@/types/database.types";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

const BEAUTY_CONTENT_PATH = "/loonars-beauty";

type LoonarsContentItemRow = Tables<"loonars_content_items">;

/** Loonars Beauty's own product briefs are consistently persuasive/UGC/educational -- category maps reasonably onto AI Director's objective vocabulary without asking the user to pick one again. */
function objectiveForCategory(category: LoonarsContentItemRow["category"]): "brand_awareness" | "leads" | "sales" | "engagement" {
  switch (category) {
    case "edukasi":
      return "brand_awareness";
    case "ugc":
      return "engagement";
    case "problem_solution":
    case "promosi":
    default:
      return "sales";
  }
}

const BEAUTY_TARGET_AUDIENCE =
  "Wanita usia 18-35 tahun di Indonesia yang peduli perawatan kulit, aktif di TikTok/Instagram, dan mencari produk skincare terpercaya dengan hasil nyata.";

function buildCampaignGoal(item: LoonarsContentItemRow): string {
  return [
    `Kategori konten: ${item.category}.`,
    item.hook ? `Hook: ${item.hook}` : "",
    item.caption ? `Caption: ${item.caption}` : "",
    item.script_notes ? `Arahan visual: ${item.script_notes}` : "",
    item.cta ? `CTA: ${item.cta}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

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
      objective: objectiveForCategory(item.category),
      platform: item.platform,
      targetAudience: BEAUTY_TARGET_AUDIENCE,
      productProject: item.product_name,
      campaignGoal: buildCampaignGoal(item),
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
