"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Brain, Eye, Heart, MessageCircle, Share2, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listContentPerformanceAction } from "@/features/kontenai/learning-engine/actions/learning.actions";
import { CONTENT_PERFORMANCE_QUERY_KEY } from "@/features/kontenai/learning-engine/hooks/use-learning-mutations";
import { platformLabel } from "@/features/kontenai/publishing-engine/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const METRIC_ICONS = [
  { key: "views", label: "Views", icon: Eye },
  { key: "reach", label: "Reach", icon: TrendingUp },
  { key: "likes", label: "Likes", icon: Heart },
  { key: "comments", label: "Comments", icon: MessageCircle },
  { key: "shares", label: "Shares", icon: Share2 },
] as const;

/** "Buat halaman Learning Dashboard" -- every logged performance record + its AI insight and next-content recommendations, newest first. */
export function LearningInsightList() {
  const { data: records, isLoading, isError, error, refetch } = useQuery({
    queryKey: CONTENT_PERFORMANCE_QUERY_KEY,
    queryFn: listContentPerformanceAction,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Gagal memuat Learning Dashboard</p>
            <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
            <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
              Coba lagi
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const list = records ?? [];

  if (list.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <Brain className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada insight yang tercatat</p>
          <p className="max-w-sm text-sm text-muted-foreground">Log performa konten di panel sebelah untuk mulai membangun Learning Dashboard.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((record) => (
        <Card key={record.id}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              {record.publishSchedule && <Badge variant="secondary">{platformLabel(record.publishSchedule.platform)}</Badge>}
              {record.publishSchedule?.renderJob?.storyboard?.title ?? "Konten"}
            </CardTitle>
            <span className="text-xs text-muted-foreground">{formatDate(record.created_at)}</span>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              {METRIC_ICONS.map(({ key, label, icon: Icon }) => (
                <span key={key} className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" />
                  {label}: {record[key]}
                </span>
              ))}
              {record.ctr !== null && <span>CTR: {record.ctr}%</span>}
              {record.leads !== null && <span>Leads: {record.leads}</span>}
            </div>

            <p className="text-sm">
              <span className="text-xs font-medium text-muted-foreground">AI Insight: </span>
              {record.ai_insight}
            </p>

            <div className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
              <p>
                <span className="font-medium text-muted-foreground">Hook berikutnya: </span>
                {record.recommended_hook}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Durasi berikutnya: </span>
                {record.recommended_duration_seconds}s
              </p>
              <p>
                <span className="font-medium text-muted-foreground">CTA berikutnya: </span>
                {record.recommended_cta}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Target Emotion berikutnya: </span>
                {record.recommended_target_emotion}
              </p>
              <p className="sm:col-span-2">
                <span className="font-medium text-muted-foreground">Visual berikutnya: </span>
                {record.recommended_visual}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
