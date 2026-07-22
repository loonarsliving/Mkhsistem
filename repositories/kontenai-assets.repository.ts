import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { Json } from "@/types/database.types";
import type { KontenAiAssetRow } from "@/types/domain";

export type KontenAiAssetType = "image" | "video" | "audio" | "logo" | "brand_guideline" | "font" | "template" | "document";
export type KontenAiAssetStatus = "draft" | "active" | "archived";
export type KontenAiAssetVisionStatus = "not_analyzed" | "pending" | "completed" | "failed";

export interface KontenAiVideoSceneSummaryItem {
  timestampSeconds: number;
  description: string;
}

export type KontenAiAssetWithCreator = Omit<KontenAiAssetRow, "ai_scene_summary"> & {
  creator: { full_name: string } | null;
  ai_scene_summary: KontenAiVideoSceneSummaryItem[];
};

const SELECT_COLUMNS =
  "id, title, description, filename, asset_type, storage_path, public_url, file_type, file_size_bytes, resolution, duration_seconds, company, project, campaign, platform, content_type, location, status, tags, ai_vision_status, ai_title, ai_description, ai_tags, ai_category, ai_detected_objects, ai_dominant_colors, ai_mood, ai_analyzed_at, ai_error, ai_scene_summary, created_by, updated_by, created_at, updated_at, creator:created_by(full_name)";

function parseSceneSummary(raw: unknown): KontenAiVideoSceneSummaryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      timestampSeconds: typeof item.timestampSeconds === "number" ? item.timestampSeconds : Number(item.timestampSeconds) || 0,
      description: typeof item.description === "string" ? item.description : "",
    }))
    .filter((item) => item.description.length > 0)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);
}

function mapAssetRow(row: Record<string, unknown>): KontenAiAssetWithCreator {
  return { ...row, ai_scene_summary: parseSceneSummary(row.ai_scene_summary) } as KontenAiAssetWithCreator;
}

export interface KontenAiAssetListFilters {
  search?: string;
  assetType?: KontenAiAssetType;
  company?: string;
  project?: string;
  campaign?: string;
  platform?: string;
  contentType?: string;
  location?: string;
  status?: KontenAiAssetStatus;
  tags?: string[];
  /** ISO date (yyyy-mm-dd) bounds on created_at, inclusive. */
  dateFrom?: string;
  dateTo?: string;
  sortBy?: "created_at" | "updated_at" | "title" | "file_size_bytes";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface KontenAiAssetListResult {
  data: KontenAiAssetWithCreator[];
  total: number;
}

/** Newest first by default; search matches the generated title/filename/description tsvector, tags match via array overlap (&&). */
export async function listKontenAiAssets(supabase: TypedSupabaseClient, filters: KontenAiAssetListFilters = {}): Promise<KontenAiAssetListResult> {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const pageSize = filters.pageSize && filters.pageSize > 0 ? filters.pageSize : 24;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("kontenai_assets")
    .select(SELECT_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.search) {
    query = query.textSearch("search_text", filters.search, { type: "websearch", config: "simple" });
  }
  if (filters.assetType) query = query.eq("asset_type", filters.assetType);
  if (filters.company) query = query.eq("company", filters.company);
  if (filters.project) query = query.eq("project", filters.project);
  if (filters.campaign) query = query.eq("campaign", filters.campaign);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.contentType) query = query.eq("content_type", filters.contentType);
  if (filters.location) query = query.eq("location", filters.location);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.tags && filters.tags.length > 0) query = query.overlaps("tags", filters.tags);
  if (filters.dateFrom) query = query.gte("created_at", `${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);

  const sortBy = filters.sortBy ?? "created_at";
  const ascending = filters.sortDir === "asc";
  query = query.order(sortBy, { ascending }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []).map((row) => mapAssetRow(row as unknown as Record<string, unknown>)), total: count ?? 0 };
}

export async function getKontenAiAsset(supabase: TypedSupabaseClient, id: string): Promise<KontenAiAssetWithCreator> {
  const { data, error } = await supabase.from("kontenai_assets").select(SELECT_COLUMNS).eq("id", id).is("deleted_at", null).single();
  if (error) throw error;
  return mapAssetRow(data as unknown as Record<string, unknown>);
}

export interface CreateKontenAiAssetInput {
  title: string;
  description: string | null;
  filename: string;
  asset_type: KontenAiAssetType;
  storage_path: string;
  public_url: string;
  file_type: string;
  file_size_bytes: number;
  resolution: string | null;
  duration_seconds: number | null;
  company: string | null;
  project: string | null;
  campaign: string | null;
  platform: string | null;
  content_type: string | null;
  location: string | null;
  status?: KontenAiAssetStatus;
  tags: string[];
  created_by: string;
}

export async function createKontenAiAsset(supabase: TypedSupabaseClient, input: CreateKontenAiAssetInput): Promise<KontenAiAssetRow> {
  const { data, error } = await supabase.from("kontenai_assets").insert(input).select().single();
  if (error) throw error;
  return data as KontenAiAssetRow;
}

export interface UpdateKontenAiAssetInput {
  title?: string;
  description?: string | null;
  company?: string | null;
  project?: string | null;
  campaign?: string | null;
  platform?: string | null;
  content_type?: string | null;
  location?: string | null;
  status?: KontenAiAssetStatus;
  tags?: string[];
}

export async function updateKontenAiAsset(
  supabase: TypedSupabaseClient,
  id: string,
  patch: UpdateKontenAiAssetInput,
  updatedBy: string,
): Promise<KontenAiAssetRow> {
  const { data, error } = await supabase
    .from("kontenai_assets")
    .update({ ...patch, updated_by: updatedBy })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiAssetRow;
}

/** Clones the metadata row onto the same underlying storage object (no physical file copy) -- deleting either row later never removes the shared file since delete is soft (deleted_at), never a storage.remove call. */
export async function duplicateKontenAiAsset(supabase: TypedSupabaseClient, id: string, createdBy: string): Promise<KontenAiAssetRow> {
  const original = await getKontenAiAsset(supabase, id);
  return createKontenAiAsset(supabase, {
    title: `${original.title} (Copy)`,
    description: original.description,
    filename: original.filename,
    asset_type: original.asset_type as KontenAiAssetType,
    storage_path: original.storage_path,
    public_url: original.public_url,
    file_type: original.file_type,
    file_size_bytes: original.file_size_bytes,
    resolution: original.resolution,
    duration_seconds: original.duration_seconds,
    company: original.company,
    project: original.project,
    campaign: original.campaign,
    platform: original.platform,
    content_type: original.content_type,
    location: original.location,
    status: "draft",
    tags: original.tags,
    created_by: createdBy,
  });
}

export async function softDeleteKontenAiAsset(supabase: TypedSupabaseClient, id: string, updatedBy: string): Promise<void> {
  const { error } = await supabase
    .from("kontenai_assets")
    .update({ deleted_at: new Date().toISOString(), updated_by: updatedBy })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw error;
}

export interface KontenAiFolderFacets {
  companies: string[];
  projects: string[];
  campaigns: string[];
  platforms: string[];
  contentTypes: string[];
  locations: string[];
}

/** Distinct classification values currently in use, for building filter dropdowns / the virtual folder browser without a fixed taxonomy. */
export async function listKontenAiFolderFacets(supabase: TypedSupabaseClient): Promise<KontenAiFolderFacets> {
  const { data, error } = await supabase
    .from("kontenai_assets")
    .select("company, project, campaign, platform, content_type, location")
    .is("deleted_at", null);
  if (error) throw error;

  const rows = data ?? [];
  const distinct = (values: (string | null)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

  return {
    companies: distinct(rows.map((r) => r.company)),
    projects: distinct(rows.map((r) => r.project)),
    campaigns: distinct(rows.map((r) => r.campaign)),
    platforms: distinct(rows.map((r) => r.platform)),
    contentTypes: distinct(rows.map((r) => r.content_type)),
    locations: distinct(rows.map((r) => r.location)),
  };
}

export interface DirectorAssetContextRow {
  id: string;
  assetType: KontenAiAssetType;
  title: string;
  aiDescription: string | null;
  aiTags: string[];
  aiCategory: string | null;
  aiMood: string | null;
}

/**
 * Asset Library entries with a completed Gemini Vision analysis, used by
 * AI Director (Sprint 3) as creative context. Prefers assets whose
 * company/project/title match `productProject` (loosely, case-insensitive);
 * falls back to the most recently analyzed assets overall when nothing
 * matches so AI Director always has something to reason about.
 */
export async function listAnalyzedAssetsForDirector(
  supabase: TypedSupabaseClient,
  filters: { productProject?: string; platform?: string; limit?: number } = {},
): Promise<DirectorAssetContextRow[]> {
  const limit = filters.limit && filters.limit > 0 ? filters.limit : 20;

  async function run(withProductFilter: boolean) {
    let query = supabase
      .from("kontenai_assets")
      .select("id, asset_type, title, ai_description, ai_tags, ai_category, ai_mood")
      .is("deleted_at", null)
      .eq("ai_vision_status", "completed");

    if (filters.platform) query = query.eq("platform", filters.platform);

    if (withProductFilter && filters.productProject) {
      const term = `%${filters.productProject.trim().replace(/[,()%]/g, "")}%`;
      query = query.or(`project.ilike.${term},company.ilike.${term},title.ilike.${term}`);
    }

    const { data, error } = await query.order("ai_analyzed_at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  let rows = filters.productProject ? await run(true) : await run(false);
  if (rows.length === 0 && filters.productProject) {
    rows = await run(false);
  }

  return rows.map((row) => ({
    id: row.id,
    assetType: row.asset_type as KontenAiAssetType,
    title: row.title,
    aiDescription: row.ai_description,
    aiTags: row.ai_tags ?? [],
    aiCategory: row.ai_category,
    aiMood: row.ai_mood,
  }));
}

export interface KontenAiAnalyzedAsset {
  id: string;
  assetType: KontenAiAssetType;
  title: string;
  publicUrl: string;
  fileType: string;
  aiTitle: string | null;
  aiDescription: string | null;
  aiTags: string[];
  aiCategory: string | null;
  aiMood: string | null;
  aiDetectedObjects: string[];
  aiDominantColors: string[];
}

/**
 * Every image/video in the Asset Library with a completed Gemini Vision
 * analysis, used by Asset Selector (Sprint 5) as the full candidate pool to
 * rank against each storyboard scene. Capped at `limit` (default 300) --
 * generous for the current library size while still bounding the ranking
 * work done per scene.
 */
export async function listAnalyzedAssetLibrary(supabase: TypedSupabaseClient, limit = 300): Promise<KontenAiAnalyzedAsset[]> {
  const { data, error } = await supabase
    .from("kontenai_assets")
    .select("id, asset_type, title, public_url, file_type, ai_title, ai_description, ai_tags, ai_category, ai_mood, ai_detected_objects, ai_dominant_colors")
    .is("deleted_at", null)
    .eq("ai_vision_status", "completed")
    .order("ai_analyzed_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    assetType: row.asset_type as KontenAiAssetType,
    title: row.title,
    publicUrl: row.public_url,
    fileType: row.file_type,
    aiTitle: row.ai_title,
    aiDescription: row.ai_description,
    aiTags: row.ai_tags ?? [],
    aiCategory: row.ai_category,
    aiMood: row.ai_mood,
    aiDetectedObjects: row.ai_detected_objects ?? [],
    aiDominantColors: row.ai_dominant_colors ?? [],
  }));
}

/** Flips ai_vision_status to 'pending' right before calling Gemini, so a concurrent list view shows the analysis is in flight. */
export async function markKontenAiAssetVisionPending(supabase: TypedSupabaseClient, id: string): Promise<void> {
  const { error } = await supabase.from("kontenai_assets").update({ ai_vision_status: "pending" }).eq("id", id).is("deleted_at", null);
  if (error) throw error;
}

export interface SaveKontenAiAssetVisionResultInput {
  title: string;
  description: string;
  tags: string[];
  category: string;
  detectedObjects: string[];
  dominantColors: string[];
  mood: string;
  /** Per-keyframe scene captions for video assets (Sprint 2 Video Intelligence) -- omitted/empty for images. */
  sceneSummary?: KontenAiVideoSceneSummaryItem[];
}

export async function saveKontenAiAssetVisionResult(
  supabase: TypedSupabaseClient,
  id: string,
  result: SaveKontenAiAssetVisionResultInput,
): Promise<KontenAiAssetRow> {
  const { data, error } = await supabase
    .from("kontenai_assets")
    .update({
      ai_vision_status: "completed",
      ai_title: result.title,
      ai_description: result.description,
      ai_tags: result.tags,
      ai_category: result.category,
      ai_detected_objects: result.detectedObjects,
      ai_dominant_colors: result.dominantColors,
      ai_mood: result.mood,
      ai_analyzed_at: new Date().toISOString(),
      ai_error: null,
      ai_scene_summary: (result.sceneSummary ?? []) as unknown as Json,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as KontenAiAssetRow;
}

export async function saveKontenAiAssetVisionFailure(supabase: TypedSupabaseClient, id: string, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from("kontenai_assets")
    .update({ ai_vision_status: "failed", ai_error: errorMessage.slice(0, 500) })
    .eq("id", id);
  if (error) throw error;
}
