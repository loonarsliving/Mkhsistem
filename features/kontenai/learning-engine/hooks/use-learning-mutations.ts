"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { generateLearningInsightAction, saveContentPerformanceAction, type SaveContentPerformanceActionInput } from "@/features/kontenai/learning-engine/actions/learning.actions";
import type { ContentPerformanceMetrics } from "@/lib/ai/domains/kontenai-learning";

export const CONTENT_PERFORMANCE_QUERY_KEY = ["kontenai-content-performance"];
export const PUBLISH_SCHEDULES_FOR_LEARNING_QUERY_KEY = ["kontenai-publish-schedules-for-learning"];

export function useGenerateLearningInsight() {
  return useMutation({
    mutationFn: async ({ publishScheduleId, metrics }: { publishScheduleId: string; metrics: ContentPerformanceMetrics }) => {
      const result = await generateLearningInsightAction(publishScheduleId, metrics);
      if (!result.success) throw new Error(result.error ?? "Gagal menghasilkan AI Insight");
      return result.data!;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghasilkan AI Insight");
    },
  });
}

export function useSaveContentPerformance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SaveContentPerformanceActionInput) => {
      const result = await saveContentPerformanceAction(input);
      if (!result.success) throw new Error(result.error ?? "Gagal menyimpan performa konten");
      return result.data!;
    },
    onSuccess: () => {
      toast.success("Performa konten & AI Insight disimpan");
      queryClient.invalidateQueries({ queryKey: CONTENT_PERFORMANCE_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan performa konten");
    },
  });
}
