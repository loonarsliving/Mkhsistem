"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { generateStoryboardAction, saveStoryboardScenesAction } from "@/features/kontenai/storyboard-engine/actions/storyboard.actions";
import type { KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";

export const STORYBOARDS_QUERY_KEY = ["kontenai-storyboards"];

export function useGenerateStoryboard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (creativeBriefId: string) => {
      const result = await generateStoryboardAction(creativeBriefId);
      if (!result.success) throw new Error(result.error ?? "Gagal menghasilkan storyboard");
      return result.data!;
    },
    onSuccess: (storyboard) => {
      toast.success(`Storyboard dibuat dengan ${Array.isArray(storyboard.scenes) ? storyboard.scenes.length : 0} scene`);
      queryClient.invalidateQueries({ queryKey: STORYBOARDS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghasilkan storyboard");
    },
  });
}

export function useSaveStoryboardScenes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ storyboardId, scenes }: { storyboardId: string; scenes: KontenAiStoryboardScene[] }) => {
      const result = await saveStoryboardScenesAction(storyboardId, scenes);
      if (!result.success) throw new Error(result.error ?? "Gagal menyimpan storyboard");
      return result.data!;
    },
    onSuccess: () => {
      toast.success("Storyboard disimpan");
      queryClient.invalidateQueries({ queryKey: STORYBOARDS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan storyboard");
    },
  });
}
