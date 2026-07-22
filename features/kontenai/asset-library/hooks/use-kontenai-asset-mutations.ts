"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createKontenAiAssetAction,
  deleteKontenAiAssetAction,
  duplicateKontenAiAssetAction,
  updateKontenAiAssetAction,
  type CreateKontenAiAssetActionInput,
  type UpdateKontenAiAssetActionInput,
} from "@/features/kontenai/asset-library/actions/asset-library.actions";
import { analyzeAssetVisionAction } from "@/features/kontenai/asset-library/actions/gemini-vision.actions";
import { guessAssetTypeFromMime } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import { inspectFile } from "@/features/kontenai/asset-library/utils/file-inspect";
import { buildAssetStoragePrefix } from "@/features/kontenai/asset-library/utils/storage-path";
import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import { uploadEntityFile } from "@/lib/supabase/storage";
import type { KontenAiAssetType } from "@/repositories/kontenai-assets.repository";

export const KONTENAI_ASSET_BUCKET = "kontenai-assets";
export const MAX_KONTENAI_ASSET_SIZE_BYTES = 200 * 1024 * 1024;

function invalidateAssetLibrary(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["kontenai-assets"] });
  queryClient.invalidateQueries({ queryKey: ["kontenai-asset-library-stats"] });
  queryClient.invalidateQueries({ queryKey: ["kontenai-folder-facets"] });
}

export interface UploadAssetFormInput {
  file: File;
  title: string;
  description: string;
  assetType: KontenAiAssetType;
  company: string;
  project: string;
  campaign: string;
  platform: string;
  contentType: string;
  location: string;
  tags: string[];
}

export function useUploadKontenAiAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadAssetFormInput) => {
      if (input.file.size > MAX_KONTENAI_ASSET_SIZE_BYTES) {
        throw new Error(`Ukuran file melebihi batas maksimum ${Math.round(MAX_KONTENAI_ASSET_SIZE_BYTES / (1024 * 1024))}MB`);
      }

      const classification = {
        company: input.company || null,
        project: input.project || null,
        campaign: input.campaign || null,
        platform: input.platform || null,
        contentType: input.contentType || null,
      };
      const prefix = buildAssetStoragePrefix(classification);
      const [{ path, publicUrl }, meta] = await Promise.all([
        uploadEntityFile(KONTENAI_ASSET_BUCKET, prefix, input.file, MAX_KONTENAI_ASSET_SIZE_BYTES),
        inspectFile(input.file),
      ]);
      if (!publicUrl) throw new Error("Gagal mendapatkan URL publik aset");

      const payload: CreateKontenAiAssetActionInput = {
        title: input.title || input.file.name,
        description: input.description || null,
        filename: input.file.name,
        assetType: input.assetType || guessAssetTypeFromMime(input.file.type),
        storagePath: path,
        publicUrl,
        fileType: input.file.type || "application/octet-stream",
        fileSizeBytes: input.file.size,
        resolution: meta.resolution,
        durationSeconds: meta.durationSeconds,
        company: classification.company,
        project: classification.project,
        campaign: classification.campaign,
        platform: classification.platform,
        contentType: classification.contentType,
        location: input.location || null,
        tags: input.tags,
      };

      const result = await createKontenAiAssetAction(payload);
      if (!result.success) throw new Error(result.error ?? "Gagal menyimpan aset");
      return result.data!;
    },
    onSuccess: ({ asset, visionAnalyzed, visionError }) => {
      if (isVisionEligibleAssetType(asset.asset_type as KontenAiAssetType)) {
        if (visionAnalyzed) toast.success("Aset diunggah & dianalisis Gemini Vision");
        else toast.warning(`Aset diunggah, tapi analisis Gemini Vision gagal: ${visionError ?? "unknown error"}. Coba "Analyze Again" nanti.`);
      } else {
        toast.success("Aset berhasil diunggah");
      }
      invalidateAssetLibrary(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal mengunggah aset");
    },
  });
}

export function useUpdateKontenAiAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ assetId, input }: { assetId: string; input: UpdateKontenAiAssetActionInput }) => {
      const result = await updateKontenAiAssetAction(assetId, input);
      if (!result.success) throw new Error(result.error ?? "Gagal memperbarui aset");
      return result.data!;
    },
    onSuccess: () => {
      toast.success("Perubahan disimpan");
      invalidateAssetLibrary(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan perubahan");
    },
  });
}

export function useDuplicateKontenAiAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string) => {
      const result = await duplicateKontenAiAssetAction(assetId);
      if (!result.success) throw new Error(result.error ?? "Gagal menduplikasi aset");
      return result.data!;
    },
    onSuccess: () => {
      toast.success("Aset diduplikasi");
      invalidateAssetLibrary(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menduplikasi aset");
    },
  });
}

export function useDeleteKontenAiAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string) => {
      const result = await deleteKontenAiAssetAction(assetId);
      if (!result.success) throw new Error(result.error ?? "Gagal menghapus aset");
    },
    onSuccess: () => {
      toast.success("Aset dihapus");
      invalidateAssetLibrary(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus aset");
    },
  });
}

/** "Analyze Again" -- re-runs Gemini Vision on an already-uploaded image/video asset. */
export function useAnalyzeAssetVision() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (assetId: string) => {
      const result = await analyzeAssetVisionAction(assetId);
      if (!result.success) throw new Error(result.error ?? "Gagal menjalankan analisis");
      return result.data!;
    },
    onSuccess: ({ analyzed, error }) => {
      if (analyzed) toast.success("Analisis Gemini Vision selesai");
      else toast.error(`Analisis Gemini Vision gagal: ${error ?? "unknown error"}`);
      invalidateAssetLibrary(queryClient);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menjalankan analisis");
    },
  });
}
