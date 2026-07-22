"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  generateCreativeBriefAction,
  type GenerateCreativeBriefActionInput,
} from "@/features/kontenai/ai-director/actions/creative-brief.actions";

export const CREATIVE_BRIEFS_QUERY_KEY = ["kontenai-creative-briefs"];

export function useGenerateCreativeBrief() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: GenerateCreativeBriefActionInput) => {
      const result = await generateCreativeBriefAction(input);
      if (!result.success) throw new Error(result.error ?? "Gagal menghasilkan Creative Brief");
      return result.data!;
    },
    onSuccess: ({ referencedAssetCount }) => {
      toast.success(
        referencedAssetCount > 0
          ? `Creative Brief dibuat berdasarkan ${referencedAssetCount} aset dari Asset Library`
          : "Creative Brief dibuat (belum ada aset relevan yang sudah dianalisis Gemini Vision)",
      );
      queryClient.invalidateQueries({ queryKey: CREATIVE_BRIEFS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghasilkan Creative Brief");
    },
  });
}
