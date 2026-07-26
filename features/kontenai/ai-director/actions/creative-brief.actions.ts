"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { generateCreativeBrief, type DirectorObjective, type DirectorPlatform } from "@/lib/ai/domains/kontenai-director";
import { createClient } from "@/lib/supabase/server";
import { listAnalyzedAssetsForDirector } from "@/repositories/kontenai-assets.repository";
import {
  createKontenAiCreativeBrief,
  listKontenAiCreativeBriefs,
  type KontenAiCreativeBriefContentFocus,
  type KontenAiCreativeBriefWithCreator,
} from "@/repositories/kontenai-creative-briefs.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiCreativeBriefRow } from "@/types/domain";

const AI_DIRECTOR_PATH = "/kontenai/ai-director";

const OBJECTIVES: DirectorObjective[] = ["brand_awareness", "leads", "sales", "engagement"];
const PLATFORMS: DirectorPlatform[] = ["instagram", "tiktok", "facebook"];

export interface GenerateCreativeBriefActionInput {
  objective: DirectorObjective;
  platform: DirectorPlatform;
  targetAudience: string;
  productProject: string;
  campaignGoal: string;
  /** Which brand this brief is for -- set by cross-module bridges (e.g. Loonars Beauty's "Kirim ke KontenAI"); omitted for briefs made directly on this page. */
  contentFocus?: KontenAiCreativeBriefContentFocus;
}

export interface GenerateCreativeBriefActionResult {
  brief: KontenAiCreativeBriefRow;
  referencedAssetCount: number;
}

/**
 * AI Director's core action: reads the campaign intent form, pulls Asset
 * Library entries already analyzed by Gemini Vision (Sprint 2) as creative
 * context, asks Gemini to reason over both and produce a Creative Brief,
 * then persists the result -- mirroring runVisionAnalysisAndSave's "never
 * throw, always return a clear ActionResult" contract used across KontenAI.
 */
export async function generateCreativeBriefAction(
  input: GenerateCreativeBriefActionInput,
): Promise<ActionResult<GenerateCreativeBriefActionResult>> {
  const session = await requireKontenAiAccess();

  if (!OBJECTIVES.includes(input.objective)) return actionError("Objective tidak valid");
  if (!PLATFORMS.includes(input.platform)) return actionError("Platform tidak valid");
  const targetAudience = input.targetAudience.trim();
  const productProject = input.productProject.trim();
  const campaignGoal = input.campaignGoal.trim();
  if (!targetAudience) return actionError("Target Audience tidak boleh kosong");
  if (!productProject) return actionError("Product/Project tidak boleh kosong");
  if (!campaignGoal) return actionError("Campaign Goal tidak boleh kosong");

  const supabase = await createClient();

  try {
    const assets = await listAnalyzedAssetsForDirector(supabase, { productProject, platform: input.platform, limit: 20 });

    const result = await generateCreativeBrief({
      objective: input.objective,
      platform: input.platform,
      targetAudience,
      productProject,
      campaignGoal,
      assets: assets.map((asset) => ({
        title: asset.title,
        assetType: asset.assetType,
        aiDescription: asset.aiDescription,
        aiTags: asset.aiTags,
        aiCategory: asset.aiCategory,
        aiMood: asset.aiMood,
      })),
    });

    const brief = await createKontenAiCreativeBrief(supabase, {
      objective: input.objective,
      platform: input.platform,
      targetAudience,
      productProject,
      campaignGoal,
      bigIdea: result.bigIdea,
      hook: result.hook,
      keyMessage: result.keyMessage,
      targetEmotion: result.targetEmotion,
      cta: result.cta,
      contentAngle: result.contentAngle,
      productionDirection: result.productionDirection,
      referencedAssetIds: assets.map((asset) => asset.id),
      contentFocus: input.contentFocus,
      createdBy: session.userId,
    });

    revalidatePath(AI_DIRECTOR_PATH);
    return actionSuccess({ brief, referencedAssetCount: assets.length });
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghasilkan Creative Brief");
  }
}

export async function listCreativeBriefsAction(): Promise<KontenAiCreativeBriefWithCreator[]> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiCreativeBriefs(supabase);
}
