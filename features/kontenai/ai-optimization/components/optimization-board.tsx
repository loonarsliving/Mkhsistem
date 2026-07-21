"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  listRecommendationsAction,
  updateRecommendationStatusAction,
} from "@/features/kontenai/ai-optimization/actions/ai-optimization.actions";
import type { OptimizationAreaFilter, OptimizationStatusFilter } from "@/features/kontenai/ai-optimization/types";
import type { OptimizationRecommendation } from "@/features/kontenai/types";
import { RecommendationCard } from "./recommendation-card";
import { SummaryStats } from "./summary-stats";

const QUERY_KEY = ["kontenai", "ai-optimization", "recommendations"];

const AREA_TABS: { value: OptimizationAreaFilter; label: string }[] = [
  { value: "all", label: "Semua Area" },
  { value: "ai_director", label: "AI Director" },
  { value: "storyboard", label: "Storyboard" },
  { value: "asset_selection", label: "Asset Selection" },
  { value: "render", label: "Render" },
];

const STATUS_OPTIONS: { value: OptimizationStatusFilter; label: string }[] = [
  { value: "all", label: "Semua Status" },
  { value: "proposed", label: "Diusulkan" },
  { value: "applied", label: "Diterapkan" },
  { value: "dismissed", label: "Ditolak" },
];

export function OptimizationBoard() {
  const queryClient = useQueryClient();
  const [areaFilter, setAreaFilter] = useState<OptimizationAreaFilter>("all");
  const [statusFilter, setStatusFilter] = useState<OptimizationStatusFilter>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: listRecommendationsAction,
  });

  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "applied" | "dismissed" }) =>
      updateRecommendationStatusAction(id, status),
    onSuccess: (updated) => {
      queryClient.setQueryData<OptimizationRecommendation[]>(QUERY_KEY, (prev) =>
        prev ? prev.map((rec) => (rec.id === updated.id ? updated : rec)) : prev,
      );
    },
  });

  const recommendations = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    return recommendations.filter((rec) => {
      const areaMatch = areaFilter === "all" || rec.area === areaFilter;
      const statusMatch = statusFilter === "all" || rec.status === statusFilter;
      return areaMatch && statusMatch;
    });
  }, [recommendations, areaFilter, statusFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-destructive">Gagal memuat rekomendasi optimasi. Coba muat ulang halaman.</p>;
  }

  return (
    <div className="space-y-6">
      <SummaryStats recommendations={recommendations} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={areaFilter} onValueChange={(value) => setAreaFilter(value as OptimizationAreaFilter)}>
          <TabsList className="flex-wrap">
            {AREA_TABS.map((tab) => (
              <TabsTrigger key={tab.value} value={tab.value}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as OptimizationStatusFilter)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Tidak ada rekomendasi yang cocok dengan filter ini.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              isMutating={mutation.isPending && mutation.variables?.id === rec.id}
              onApply={(id) => mutation.mutate({ id, status: "applied" })}
              onDismiss={(id) => mutation.mutate({ id, status: "dismissed" })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
