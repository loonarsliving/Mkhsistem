import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { KontenAiAssetRow } from "@/types/domain";

export type KontenAiAssetType = "image" | "video" | "audio" | "logo" | "brand_guideline" | "font" | "template" | "document";
export type KontenAiAssetStatus = "draft" | "active" | "archived";

export type KontenAiAssetWithCreator = KontenAiAssetRow & { creator: { full_name: string } | null };

const SELECT_COLUMNS =
  "id, title, description, filename, asset_type, storage_path, public_url, file_type, file_size_bytes, resolution, duration_seconds, company, project, campaign, platform, content_type, location, status, tags, created_by, updated_by, created_at, updated_at, creator:created_by(full_name)";

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
  return { data: (data ?? []) as unknown as KontenAiAssetWithCreator[], total: count ?? 0 };
}

export async function getKontenAiAsset(supabase: TypedSupabaseClient, id: string): Promise<KontenAiAssetWithCreator> {
  const { data, error } = await supabase.from("kontenai_assets").select(SELECT_COLUMNS).eq("id", id).is("deleted_at", null).single();
  if (error) throw error;
  return data as unknown as KontenAiAssetWithCreator;
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
