import type { OptimizationArea, OptimizationRecommendation } from "@/features/kontenai/types";

/** Local UI filter types for the AI Optimization board -- not part of the shared pipeline contract. */
export type OptimizationAreaFilter = OptimizationArea | "all";

export type OptimizationStatusFilter = OptimizationRecommendation["status"] | "all";
