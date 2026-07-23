"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listPublishSchedulesForLearningAction } from "@/features/kontenai/learning-engine/actions/learning.actions";
import { useGenerateLearningInsight, useSaveContentPerformance, PUBLISH_SCHEDULES_FOR_LEARNING_QUERY_KEY } from "@/features/kontenai/learning-engine/hooks/use-learning-mutations";
import { platformLabel } from "@/features/kontenai/publishing-engine/types";
import type { ContentPerformanceMetrics, LearningInsightResult } from "@/lib/ai/domains/kontenai-learning";

const EMPTY_METRICS: ContentPerformanceMetrics = { views: 0, reach: 0, likes: 0, comments: 0, shares: 0, saves: 0, ctr: null, leads: null };

function numberField(value: number | null): string {
  return value === null ? "" : String(value);
}

/** Logs real performance metrics for one publish schedule, then generates + saves the AI insight and next-content recommendations (spec items 1-6). */
export function PerformanceLogForm() {
  const { data: schedules, isLoading: isSchedulesLoading } = useQuery({
    queryKey: PUBLISH_SCHEDULES_FOR_LEARNING_QUERY_KEY,
    queryFn: listPublishSchedulesForLearningAction,
  });

  const [scheduleId, setScheduleId] = React.useState<string | null>(null);
  const [metrics, setMetrics] = React.useState<ContentPerformanceMetrics>(EMPTY_METRICS);
  const [insight, setInsight] = React.useState<LearningInsightResult | null>(null);

  const generateMutation = useGenerateLearningInsight();
  const saveMutation = useSaveContentPerformance();

  function updateMetric(key: keyof ContentPerformanceMetrics, raw: string) {
    setMetrics((prev) => ({ ...prev, [key]: raw === "" ? (key === "ctr" || key === "leads" ? null : 0) : Number(raw) }));
  }

  function handleGenerate() {
    if (!scheduleId) return;
    generateMutation.mutate({ publishScheduleId: scheduleId, metrics }, { onSuccess: setInsight });
  }

  function handleSave() {
    if (!scheduleId || !insight) return;
    saveMutation.mutate(
      {
        publishScheduleId: scheduleId,
        metrics,
        insight: insight.insight,
        recommendedHook: insight.recommendedHook,
        recommendedDurationSeconds: insight.recommendedDurationSeconds,
        recommendedCta: insight.recommendedCta,
        recommendedVisual: insight.recommendedVisual,
        recommendedTargetEmotion: insight.recommendedTargetEmotion,
      },
      {
        onSuccess: () => {
          setScheduleId(null);
          setMetrics(EMPTY_METRICS);
          setInsight(null);
        },
      },
    );
  }

  const list = schedules ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Log Performa Konten</CardTitle>
        <CardDescription>Pilih konten yang sudah dipublikasikan, catat metrik performanya, lalu hasilkan AI Insight & rekomendasi konten berikutnya.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isSchedulesLoading ? (
          <Skeleton className="h-9 w-full" />
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada konten dari{" "}
            <a href="/kontenai/publishing-engine" className="underline">
              Publishing Engine
            </a>{" "}
            untuk dicatat performanya.
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="performance-schedule">Konten</Label>
            <Select value={scheduleId ?? undefined} onValueChange={(value) => { setScheduleId(value); setInsight(null); }}>
              <SelectTrigger id="performance-schedule">
                <SelectValue placeholder="Pilih konten..." />
              </SelectTrigger>
              <SelectContent>
                {list.map((schedule) => (
                  <SelectItem key={schedule.id} value={schedule.id}>
                    {schedule.renderJob?.storyboard?.title ?? "Video"} -- {platformLabel(schedule.platform)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {scheduleId && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="metric-views">Views</Label>
                <Input id="metric-views" type="number" min={0} value={numberField(metrics.views)} onChange={(e) => updateMetric("views", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-reach">Reach</Label>
                <Input id="metric-reach" type="number" min={0} value={numberField(metrics.reach)} onChange={(e) => updateMetric("reach", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-likes">Likes</Label>
                <Input id="metric-likes" type="number" min={0} value={numberField(metrics.likes)} onChange={(e) => updateMetric("likes", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-comments">Comments</Label>
                <Input id="metric-comments" type="number" min={0} value={numberField(metrics.comments)} onChange={(e) => updateMetric("comments", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-shares">Shares</Label>
                <Input id="metric-shares" type="number" min={0} value={numberField(metrics.shares)} onChange={(e) => updateMetric("shares", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-saves">Saves</Label>
                <Input id="metric-saves" type="number" min={0} value={numberField(metrics.saves)} onChange={(e) => updateMetric("saves", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-ctr">CTR (%)</Label>
                <Input id="metric-ctr" type="number" min={0} step="0.1" value={numberField(metrics.ctr)} onChange={(e) => updateMetric("ctr", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="metric-leads">Leads</Label>
                <Input id="metric-leads" type="number" min={0} value={numberField(metrics.leads)} onChange={(e) => updateMetric("leads", e.target.value)} />
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full" disabled={generateMutation.isPending} onClick={handleGenerate}>
              <Sparkles className="h-4 w-4" />
              {generateMutation.isPending ? "Menganalisis performa..." : "Generate AI Insight"}
            </Button>

            {insight && (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Insight: </span>
                  {insight.insight}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Hook berikutnya: </span>
                  {insight.recommendedHook}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Durasi berikutnya: </span>
                  {insight.recommendedDurationSeconds}s
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">CTA berikutnya: </span>
                  {insight.recommendedCta}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Visual berikutnya: </span>
                  {insight.recommendedVisual}
                </p>
                <p>
                  <span className="text-xs font-medium text-muted-foreground">Target Emotion berikutnya: </span>
                  {insight.recommendedTargetEmotion}
                </p>
              </div>
            )}

            <Button type="button" className="w-full" disabled={!insight || saveMutation.isPending} onClick={handleSave}>
              {saveMutation.isPending ? "Menyimpan..." : "Simpan Insight"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
