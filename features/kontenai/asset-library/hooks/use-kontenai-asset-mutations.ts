"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deleteKontenAiAssetAction,
  duplicateKontenAiAssetAction,
  updateKontenAiAssetAction,
  uploadKontenAiAssetAction,
  type UpdateKontenAiAssetActionInput,
} from "@/features/kontenai/asset-library/actions/asset-library.actions";
import { analyzeAssetVisionAction } from "@/features/kontenai/asset-library/actions/gemini-vision.actions";
import { guessAssetTypeFromMime } from "@/features/kontenai/asset-library/utils/asset-type-meta";
import { inspectFile } from "@/features/kontenai/asset-library/utils/file-inspect";
import { isVisionEligibleAssetType } from "@/features/kontenai/asset-library/utils/vision-eligibility";
import type { KontenAiAssetType } from "@/repositories/kontenai-assets.repository";

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

      const meta = await inspectFile(input.file);

      const formData = new FormData();
      formData.set("file", input.file);
      formData.set("title", input.title || input.file.name);
      formData.set("description", input.description || "");
      formData.set("assetType", input.assetType || guessAssetTypeFromMime(input.file.type));
      formData.set("company", input.company || "");
      formData.set("project", input.project || "");
      formData.set("campaign", input.campaign || "");
      formData.set("platform", input.platform || "");
      formData.set("contentType", input.contentType || "");
      formData.set("location", input.location || "");
      formData.set("tags", JSON.stringify(input.tags));
      if (meta.resolution) formData.set("resolution", meta.resolution);
      if (meta.durationSeconds !== null) formData.set("durationSeconds", String(meta.durationSeconds));

      const result = await uploadKontenAiAssetAction(formData);
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
