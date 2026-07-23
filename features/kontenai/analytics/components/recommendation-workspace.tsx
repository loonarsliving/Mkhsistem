"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Lightbulb, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listOptimizationRecommendationsAction } from "@/features/kontenai/analytics/actions/analytics.actions";
import { OPTIMIZATION_RECOMMENDATIONS_QUERY_KEY, useGenerateOptimizationRecommendation } from "@/features/kontenai/analytics/hooks/use-analytics-mutations";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Spec items 6-7: "AI Recommendation" -- generate a fresh recommendation from Learning Engine's accumulated history, and browse every past one. */
export function RecommendationWorkspace() {
  const { data: records, isLoading, isError, error, refetch } = useQuery({
    queryKey: OPTIMIZATION_RECOMMENDATIONS_QUERY_KEY,
    queryFn: listOptimizationRecommendationsAction,
  });

  const generateMutation = useGenerateOptimizationRecommendation();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button type="button" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
            <Sparkles className="h-4 w-4" />
            {generateMutation.isPending ? "Menganalisis Learning Engine..." : "Generate AI Recommendation"}
          </Button>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Gagal memuat riwayat rekomendasi</p>
              <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
              <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
                Coba lagi
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (records ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Lightbulb className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Belum ada rekomendasi</p>
            <p className="max-w-sm text-sm text-muted-foreground">Klik &quot;Generate AI Recommendation&quot; setelah ada data performa konten di Learning Engine.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(records ?? []).map((record) => (
            <Card key={record.id}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <span>Berdasarkan {record.based_on_record_count} data performa</span>
                  <span className="text-xs font-normal text-muted-foreground">{formatDate(record.created_at)}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Hook: </span>
                  {record.recommended_hook}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Caption: </span>
                  {record.recommended_caption}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">CTA: </span>
                  {record.recommended_cta}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Durasi: </span>
                  {record.recommended_duration_seconds}s
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Visual Style: </span>
                  {record.recommended_visual_style}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Posting Time: </span>
                  {record.recommended_posting_time}
                </p>
                <p className="pt-1 text-xs text-muted-foreground">{record.rationale}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
