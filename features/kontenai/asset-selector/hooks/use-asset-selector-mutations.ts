"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { overrideSceneAssetAction, runAssetSelectionAction } from "@/features/kontenai/asset-selector/actions/select-assets.actions";
import { STORYBOARDS_QUERY_KEY } from "@/features/kontenai/storyboard-engine/hooks/use-storyboard-mutations";

function invalidate(queryClient: ReturnType<typeof useQueryClient>, storyboardId: string) {
  queryClient.invalidateQueries({ queryKey: STORYBOARDS_QUERY_KEY });
  queryClient.invalidateQueries({ queryKey: ["kontenai-storyboard", storyboardId] });
}

export function useRunAssetSelection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (storyboardId: string) => {
      const result = await runAssetSelectionAction(storyboardId);
      if (!result.success) throw new Error(result.error ?? "Gagal menjalankan Asset Selector");
      return result.data!;
    },
    onSuccess: ({ storyboard, queuedVideoGenerationCount }) => {
      toast.success(
        queuedVideoGenerationCount > 0
          ? `Asset Selector selesai -- ${queuedVideoGenerationCount} scene menunggu video AI (Veo) karena belum ada aset yang cocok`
          : "Asset Selector selesai memilih aset untuk setiap scene",
      );
      invalidate(queryClient, storyboard.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menjalankan Asset Selector");
    },
  });
}

export function useOverrideSceneAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyboardId, sceneId, assetId }: { storyboardId: string; sceneId: string; assetId: string }) => {
      const result = await overrideSceneAssetAction(storyboardId, sceneId, assetId);
      if (!result.success) throw new Error(result.error ?? "Gagal mengganti aset");
      return result.data!;
    },
    onSuccess: (storyboard) => {
      toast.success("Aset scene diganti");
      invalidate(queryClient, storyboard.id);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal mengganti aset");
    },
  });
}
