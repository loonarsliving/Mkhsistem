"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { generateAiReportAction, generateOptimizationRecommendationAction } from "@/features/kontenai/analytics/actions/analytics.actions";

export const ANALYTICS_DASHBOARD_QUERY_KEY = ["kontenai-analytics-dashboard"];
export const OPTIMIZATION_RECOMMENDATIONS_QUERY_KEY = ["kontenai-optimization-recommendations"];
export const AI_REPORTS_QUERY_KEY = ["kontenai-ai-reports"];

export function useGenerateOptimizationRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await generateOptimizationRecommendationAction();
      if (!result.success) throw new Error(result.error ?? "Gagal menghasilkan AI Recommendation");
      return result.data!;
    },
    onSuccess: () => {
      toast.success("AI Recommendation dihasilkan");
      queryClient.invalidateQueries({ queryKey: OPTIMIZATION_RECOMMENDATIONS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghasilkan AI Recommendation");
    },
  });
}

export function useGenerateAiReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (period: "weekly" | "monthly") => {
      const result = await generateAiReportAction(period);
      if (!result.success) throw new Error(result.error ?? "Gagal menghasilkan AI Report");
      return result.data!;
    },
    onSuccess: () => {
      toast.success("AI Report dihasilkan");
      queryClient.invalidateQueries({ queryKey: AI_REPORTS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Gagal menghasilkan AI Report");
    },
  });
}
