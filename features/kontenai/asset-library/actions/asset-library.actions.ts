"use server";

import { revalidatePath } from "next/cache";

import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { createClient } from "@/lib/supabase/server";
import {
  createKontenAiAsset,
  duplicateKontenAiAsset,
  getKontenAiAsset,
  listKontenAiAssets,
  listKontenAiFolderFacets,
  softDeleteKontenAiAsset,
  updateKontenAiAsset,
  type KontenAiAssetListFilters,
  type KontenAiAssetListResult,
  type KontenAiAssetStatus,
  type KontenAiAssetType,
  type KontenAiAssetWithCreator,
  type KontenAiFolderFacets,
  type UpdateKontenAiAssetInput,
} from "@/repositories/kontenai-assets.repository";
import { actionError, actionSuccess, type ActionResult, type KontenAiAssetRow } from "@/types/domain";

const ASSET_LIBRARY_PATH = "/kontenai/asset-library";

const ASSET_TYPES: KontenAiAssetType[] = ["image", "video", "audio", "logo", "brand_guideline", "font", "template", "document"];

function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    normalized.push(tag);
  }
  return normalized;
}

export async function listKontenAiAssetsAction(filters: KontenAiAssetListFilters = {}): Promise<KontenAiAssetListResult> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiAssets(supabase, filters);
}

export async function getKontenAiFolderFacetsAction(): Promise<KontenAiFolderFacets> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return listKontenAiFolderFacets(supabase);
}

export interface AssetLibraryStats {
  totalAssets: number;
  byType: Record<KontenAiAssetType, number>;
  byStatus: Record<KontenAiAssetStatus, number>;
}

export async function getAssetLibraryStatsAction(): Promise<AssetLibraryStats> {
  await requireKontenAiAccess();
  const supabase = await createClient();

  const { count: totalAssets } = await supabase.from("kontenai_assets").select("id", { count: "exact", head: true }).is("deleted_at", null);

  const byType = {} as Record<KontenAiAssetType, number>;
  const byStatus = {} as Record<KontenAiAssetStatus, number>;

  await Promise.all(
    ASSET_TYPES.map(async (type) => {
      const { count } = await supabase.from("kontenai_assets").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("asset_type", type);
      byType[type] = count ?? 0;
    }),
  );

  await Promise.all(
    (["draft", "active", "archived"] as KontenAiAssetStatus[]).map(async (status) => {
      const { count } = await supabase.from("kontenai_assets").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", status);
      byStatus[status] = count ?? 0;
    }),
  );

  return { totalAssets: totalAssets ?? 0, byType, byStatus };
}

export interface CreateKontenAiAssetActionInput {
  title: string;
  description: string | null;
  filename: string;
  assetType: KontenAiAssetType;
  storagePath: string;
  publicUrl: string;
  fileType: string;
  fileSizeBytes: number;
  resolution: string | null;
  durationSeconds: number | null;
  company: string | null;
  project: string | null;
  campaign: string | null;
  platform: string | null;
  contentType: string | null;
  location: string | null;
  tags: string[];
}

/** Called after the file itself has already been uploaded client-side to Supabase Storage (see lib/supabase/storage.ts uploadEntityFile) -- this only persists the metadata row. */
export async function createKontenAiAssetAction(input: CreateKontenAiAssetActionInput): Promise<ActionResult<KontenAiAssetRow>> {
  const session = await requireKontenAiAccess();

  const title = input.title.trim();
  if (!title) return actionError("Judul tidak boleh kosong");
  if (!input.filename.trim()) return actionError("Nama file tidak valid");
  if (!ASSET_TYPES.includes(input.assetType)) return actionError("Tipe aset tidak valid");
  if (!Number.isFinite(input.fileSizeBytes) || input.fileSizeBytes <= 0) return actionError("Ukuran file tidak valid");
  if (!input.storagePath || !input.publicUrl) return actionError("Upload file gagal, path/URL penyimpanan kosong");

  const supabase = await createClient();
  try {
    const asset = await createKontenAiAsset(supabase, {
      title,
      description: input.description?.trim() || null,
      filename: input.filename.trim(),
      asset_type: input.assetType,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      file_type: input.fileType,
      file_size_bytes: Math.round(input.fileSizeBytes),
      resolution: input.resolution,
      duration_seconds: input.durationSeconds,
      company: input.company?.trim() || null,
      project: input.project?.trim() || null,
      campaign: input.campaign?.trim() || null,
      platform: input.platform?.trim() || null,
      content_type: input.contentType?.trim() || null,
      location: input.location?.trim() || null,
      tags: normalizeTags(input.tags),
      created_by: session.userId,
    });
    revalidatePath(ASSET_LIBRARY_PATH);
    return actionSuccess(asset);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menyimpan aset");
  }
}

export interface UpdateKontenAiAssetActionInput {
  title?: string;
  description?: string | null;
  company?: string | null;
  project?: string | null;
  campaign?: string | null;
  platform?: string | null;
  contentType?: string | null;
  location?: string | null;
  status?: KontenAiAssetStatus;
  tags?: string[];
}

/** One action for rename, move-folder (company/project/campaign/platform/content type), status change, and tag edits -- all are the same "update classification metadata" operation. */
export async function updateKontenAiAssetAction(assetId: string, input: UpdateKontenAiAssetActionInput): Promise<ActionResult<KontenAiAssetRow>> {
  const session = await requireKontenAiAccess();

  if (input.title !== undefined && !input.title.trim()) {
    return actionError("Judul tidak boleh kosong");
  }

  const patch: UpdateKontenAiAssetInput = {};
  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.description !== undefined) patch.description = input.description?.trim() || null;
  if (input.company !== undefined) patch.company = input.company?.trim() || null;
  if (input.project !== undefined) patch.project = input.project?.trim() || null;
  if (input.campaign !== undefined) patch.campaign = input.campaign?.trim() || null;
  if (input.platform !== undefined) patch.platform = input.platform?.trim() || null;
  if (input.contentType !== undefined) patch.content_type = input.contentType?.trim() || null;
  if (input.location !== undefined) patch.location = input.location?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);

  const supabase = await createClient();
  try {
    const asset = await updateKontenAiAsset(supabase, assetId, patch, session.userId);
    revalidatePath(ASSET_LIBRARY_PATH);
    return actionSuccess(asset);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal memperbarui aset");
  }
}

export async function duplicateKontenAiAssetAction(assetId: string): Promise<ActionResult<KontenAiAssetRow>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();
  try {
    const asset = await duplicateKontenAiAsset(supabase, assetId, session.userId);
    revalidatePath(ASSET_LIBRARY_PATH);
    return actionSuccess(asset);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menduplikasi aset");
  }
}

/** Soft delete only -- the underlying Storage object is kept (another duplicated row may still reference it), matching the deleted_at convention used across the rest of MK Connect. */
export async function deleteKontenAiAssetAction(assetId: string): Promise<ActionResult<undefined>> {
  const session = await requireKontenAiAccess();
  const supabase = await createClient();
  try {
    await softDeleteKontenAiAsset(supabase, assetId, session.userId);
    revalidatePath(ASSET_LIBRARY_PATH);
    return actionSuccess(undefined);
  } catch (error) {
    return actionError(error instanceof Error ? error.message : "Gagal menghapus aset");
  }
}

export async function getKontenAiAssetAction(assetId: string): Promise<KontenAiAssetWithCreator> {
  await requireKontenAiAccess();
  const supabase = await createClient();
  return getKontenAiAsset(supabase, assetId);
}
