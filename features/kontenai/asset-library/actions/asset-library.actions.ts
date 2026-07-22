"use server";

import { revalidatePath } from "next/cache";

import { runVisionAnalysisAndSave } from "@/features/kontenai/asset-library/actions/gemini-vision.actions";
import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import { requireKontenAiAccess } from "@/features/kontenai/lib/access";
import { ensureDriveFolderPath, isGoogleDriveConfigured, uploadFileToDrive } from "@/lib/google-drive/client";
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

export interface CreateKontenAiAssetActionResult {
  asset: KontenAiAssetRow;
  /** Whether Gemini Vision ran for this asset (image/video only) and succeeded -- false + visionError set if it ran but failed; undefined (no visionError) if the asset type isn't eligible at all. */
  visionAnalyzed: boolean;
  visionError?: string;
}

function readClassification(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Uploads the file itself to Google Drive (server-side, using the KontenAI
 * Drive service account -- see lib/google-drive/client.ts), persists the
 * metadata row, then, for image/video assets, immediately runs Gemini
 * Vision synchronously (same request) before returning -- mirroring
 * createContentSubmissionAction's "insert succeeds first, independently of
 * the AI outcome" pattern. A failed analysis never fails the upload itself;
 * "Analyze Again" (analyzeAssetVisionAction) can retry.
 *
 * Every new asset is written to Drive, not Supabase Storage -- Asset
 * Library's single source of truth going forward. Pre-existing rows stay on
 * Supabase Storage (storage_provider='supabase', untouched).
 */
export async function uploadKontenAiAssetAction(formData: FormData): Promise<ActionResult<CreateKontenAiAssetActionResult>> {
  const session = await requireKontenAiAccess();

  if (!isGoogleDriveConfigured()) {
    return actionError("Google Drive belum dikonfigurasi -- set env var GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, dan GOOGLE_DRIVE_ROOT_FOLDER_ID di Vercel.");
  }

  const file = formData.get("file");
  if (!(file instanceof File)) return actionError("File tidak ditemukan");

  const title = (formData.get("title") as string | null)?.trim() || file.name;
  const assetType = (formData.get("assetType") as string | null) || "";
  if (!ASSET_TYPES.includes(assetType as KontenAiAssetType)) return actionError("Tipe aset tidak valid");

  const company = readClassification(formData, "company");
  const project = readClassification(formData, "project");
  const campaign = readClassification(formData, "campaign");
  const platform = readClassification(formData, "platform");
  const contentType = readClassification(formData, "contentType");
  const location = readClassification(formData, "location");
  const description = readClassification(formData, "description");
  const resolution = readClassification(formData, "resolution");
  const durationRaw = formData.get("durationSeconds") as string | null;
  const durationSeconds = durationRaw ? Number(durationRaw) || null : null;
  const tags = normalizeTags(JSON.parse((formData.get("tags") as string | null) || "[]"));

  const supabase = await createClient();
  try {
    const dateSegment = new Date().toISOString().slice(0, 10);
    const folderSegments = [company, project, campaign, platform, contentType, dateSegment].filter((s): s is string => Boolean(s));
    const folderId = await ensureDriveFolderPath(folderSegments);

    const buffer = Buffer.from(await file.arrayBuffer());
    const { fileId, webViewLink } = await uploadFileToDrive({
      folderId,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer,
    });

    const asset = await createKontenAiAsset(supabase, {
      title,
      description,
      filename: file.name,
      asset_type: assetType as KontenAiAssetType,
      storage_path: fileId,
      public_url: webViewLink,
      storage_provider: "google_drive",
      file_type: file.type || "application/octet-stream",
      file_size_bytes: file.size,
      resolution,
      duration_seconds: durationSeconds,
      company,
      project,
      campaign,
      platform,
      content_type: contentType,
      location,
      tags,
      created_by: session.userId,
    });

    let visionAnalyzed = false;
    let visionError: string | undefined;
    if (isVisionEligibleAssetType(asset.asset_type as KontenAiAssetType)) {
      const outcome = await runVisionAnalysisAndSave(supabase, asset);
      visionAnalyzed = outcome.success;
      visionError = outcome.error;
    }

    revalidatePath(ASSET_LIBRARY_PATH);
    return actionSuccess({ asset, visionAnalyzed, visionError });
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
