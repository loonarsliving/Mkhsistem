import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";
import type { KontenAiStoryboardRow } from "@/types/domain";

export interface KontenAiSceneAssetMatch {
  assetId: string;
  score: number;
}

export interface KontenAiStoryboardScene {
  id: string;
  order: number;
  sceneTitle: string;
  visualDescription: string;
  cameraAngle: string;
  shotType: string;
  motion: string;
  voiceOver: string;
  onScreenText: string;
  durationSeconds: number;
  /** Sprint 5 (Asset Selector): the auto-selected (or manually overridden) asset for this scene, null until Asset Selector has run. */
  selectedAssetId: string | null;
  /** Sprint 5: top-5 ranked candidates (including the selected one) by relevance score, highest first -- lets the UI show alternatives without re-running the match. */
  assetMatches: KontenAiSceneAssetMatch[];
}

export interface KontenAiStoryboardWithBrief extends Omit<KontenAiStoryboardRow, "scenes"> {
  scenes: KontenAiStoryboardScene[];
  creativeBrief: { product_project: string; objective: string; platform: string; big_idea: string; production_direction: Json; content_focus: string | null } | null;
}

const SELECT_COLUMNS =
  "id, creative_brief_id, title, scenes, total_duration_seconds, created_by, updated_by, created_at, updated_at, creativeBrief:creative_brief_id(product_project, objective, platform, big_idea, production_direction, content_focus)";

function parseAssetMatches(raw: unknown): KontenAiSceneAssetMatch[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      assetId: typeof item.assetId === "string" ? item.assetId : "",
      score: typeof item.score === "number" ? item.score : 0,
    }))
    .filter((match) => match.assetId.length > 0);
}

function parseScenes(raw: unknown): KontenAiStoryboardScene[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id ? item.id : `scene-${index}`,
      order: index,
      sceneTitle: typeof item.sceneTitle === "string" ? item.sceneTitle : "",
      visualDescription: typeof item.visualDescription === "string" ? item.visualDescription : "",
      cameraAngle: typeof item.cameraAngle === "string" ? item.cameraAngle : "",
      shotType: typeof item.shotType === "string" ? item.shotType : "",
      motion: typeof item.motion === "string" ? item.motion : "",
      voiceOver: typeof item.voiceOver === "string" ? item.voiceOver : "",
      onScreenText: typeof item.onScreenText === "string" ? item.onScreenText : "",
      durationSeconds: typeof item.durationSeconds === "number" && item.durationSeconds > 0 ? item.durationSeconds : 4,
      selectedAssetId: typeof item.selectedAssetId === "string" && item.selectedAssetId ? item.selectedAssetId : null,
      assetMatches: parseAssetMatches(item.assetMatches),
    }));
}

function mapStoryboardRow(row: Record<string, unknown>): KontenAiStoryboardWithBrief {
  return { ...row, scenes: parseScenes(row.scenes) } as unknown as KontenAiStoryboardWithBrief;
}

export function sumSceneDurations(scenes: KontenAiStoryboardScene[]): number {
  return scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0);
}

export interface CreateKontenAiStoryboardInput {
  creativeBriefId: string;
  title: string;
  scenes: KontenAiStoryboardScene[];
  createdBy: string;
}

export async function createKontenAiStoryboard(
  supabase: TypedSupabaseClient,
  input: CreateKontenAiStoryboardInput,
): Promise<KontenAiStoryboardRow> {
  const normalizedScenes = input.scenes.map((scene, index) => ({ ...scene, order: index }));
  const { data, error } = await supabase
    .from("kontenai_storyboards")
    .insert({
      creative_brief_id: input.creativeBriefId,
      title: input.title,
      scenes: normalizedScenes as unknown as Json,
      total_duration_seconds: sumSceneDurations(normalizedScenes),
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiStoryboardRow;
}

/** Newest first -- the "daftar storyboard yang pernah dibuat" history list. */
export async function listKontenAiStoryboards(supabase: TypedSupabaseClient, limit = 50): Promise<KontenAiStoryboardWithBrief[]> {
  const { data, error } = await supabase.from("kontenai_storyboards").select(SELECT_COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => mapStoryboardRow(row as unknown as Record<string, unknown>));
}

export async function getKontenAiStoryboard(supabase: TypedSupabaseClient, id: string): Promise<KontenAiStoryboardWithBrief> {
  const { data, error } = await supabase.from("kontenai_storyboards").select(SELECT_COLUMNS).eq("id", id).single();
  if (error) throw error;
  return mapStoryboardRow(data as unknown as Record<string, unknown>);
}

/** Replaces the whole scene list -- covers add, remove, reorder, and field edits in one call, since the builder UI always edits the full ordered array together. */
export async function updateKontenAiStoryboardScenes(
  supabase: TypedSupabaseClient,
  id: string,
  scenes: KontenAiStoryboardScene[],
  updatedBy: string,
): Promise<KontenAiStoryboardRow> {
  const normalizedScenes = scenes.map((scene, index) => ({ ...scene, order: index }));
  const { data, error } = await supabase
    .from("kontenai_storyboards")
    .update({
      scenes: normalizedScenes as unknown as Json,
      total_duration_seconds: sumSceneDurations(normalizedScenes),
      updated_by: updatedBy,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiStoryboardRow;
}
