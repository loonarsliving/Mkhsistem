import type { ProductionDirection } from "@/lib/ai/domains/kontenai-director";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiCreativeBriefRow } from "@/types/domain";

export type KontenAiCreativeBriefObjective = "brand_awareness" | "leads" | "sales" | "engagement";
export type KontenAiCreativeBriefPlatform = "instagram" | "tiktok" | "facebook";

export interface KontenAiCreativeBriefWithCreator extends KontenAiCreativeBriefRow {
  creator: { full_name: string } | null;
}

const SELECT_COLUMNS =
  "id, objective, platform, target_audience, product_project, campaign_goal, big_idea, hook, key_message, target_emotion, cta, content_angle, referenced_asset_ids, content_focus, created_by, created_at, creator:created_by(full_name)";

export type KontenAiCreativeBriefContentFocus = "leasehold_sales" | "occupancy" | "beauty";

export interface CreateKontenAiCreativeBriefInput {
  objective: KontenAiCreativeBriefObjective;
  platform: KontenAiCreativeBriefPlatform;
  targetAudience: string;
  productProject: string;
  campaignGoal: string;
  bigIdea: string;
  hook: string;
  keyMessage: string;
  targetEmotion: string;
  cta: string;
  contentAngle: string;
  referencedAssetIds: string[];
  /**
   * Full production direction from AI Director (0184). Optional so an older
   * caller still compiles, but every real caller passes it -- the render
   * worker reads music.searchQuery and voiceOver.useVoiceOver from here, and
   * an empty object silently falls back to generic defaults.
   */
  productionDirection?: ProductionDirection;
  /** Which brand this brief is for -- set by cross-module bridges (e.g. Loonars Beauty's "Kirim ke KontenAI"); omitted for briefs made directly on the AI Director page, which isn't brand-scoped. */
  contentFocus?: KontenAiCreativeBriefContentFocus;
  createdBy: string;
  /** Set only when this brief was produced by the daily automation pipeline from a kpi_task; null for manually-created briefs (AI Director UI). */
  kpiTaskId?: string | null;
}

export async function createKontenAiCreativeBrief(
  supabase: TypedSupabaseClient,
  input: CreateKontenAiCreativeBriefInput,
): Promise<KontenAiCreativeBriefRow> {
  const { data, error } = await supabase
    .from("kontenai_creative_briefs")
    .insert({
      objective: input.objective,
      platform: input.platform,
      target_audience: input.targetAudience,
      product_project: input.productProject,
      campaign_goal: input.campaignGoal,
      big_idea: input.bigIdea,
      hook: input.hook,
      key_message: input.keyMessage,
      target_emotion: input.targetEmotion,
      cta: input.cta,
      content_angle: input.contentAngle,
      referenced_asset_ids: input.referencedAssetIds,
      production_direction: input.productionDirection ?? {},
      content_focus: input.contentFocus ?? null,
      created_by: input.createdBy,
      kpi_task_id: input.kpiTaskId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiCreativeBriefRow;
}

export async function getKontenAiCreativeBrief(supabase: TypedSupabaseClient, id: string): Promise<KontenAiCreativeBriefRow> {
  const { data, error } = await supabase.from("kontenai_creative_briefs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as KontenAiCreativeBriefRow;
}

/** Newest first -- the "riwayat Creative Brief" history list on the AI Director page. */
export async function listKontenAiCreativeBriefs(
  supabase: TypedSupabaseClient,
  limit = 50,
): Promise<KontenAiCreativeBriefWithCreator[]> {
  const { data, error } = await supabase
    .from("kontenai_creative_briefs")
    .select(SELECT_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as KontenAiCreativeBriefWithCreator[];
}
