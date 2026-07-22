"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalyticsDashboardDataAction } from "@/features/kontenai/analytics/actions/analytics.actions";
import { ContentRankingList } from "@/features/kontenai/analytics/components/content-ranking-list";
import { KpiGrid } from "@/features/kontenai/analytics/components/kpi-grid";
import { PerformanceChart } from "@/features/kontenai/analytics/components/performance-chart";
import { ANALYTICS_DASHBOARD_QUERY_KEY } from "@/features/kontenai/analytics/hooks/use-analytics-mutations";

/** Spec items 1-5: Analytics Dashboard -- KPIs, performance-over-time chart, Top & Worst Performing Content. */
export function AnalyticsDashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ANALYTICS_DASHBOARD_QUERY_KEY,
    queryFn: getAnalyticsDashboardDataAction,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="flex items-start gap-2 py-6 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Gagal memuat Analytics Dashboard</p>
            <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
            <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
              Coba lagi
            </button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.kpis.totalContent === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
          <BarChart3 className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Belum ada data</p>
          <p className="max-w-sm text-sm text-muted-foreground">Jadwalkan konten di Publishing Engine dan catat performanya di Learning Engine untuk mengisi dashboard ini.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <KpiGrid kpis={data.kpis} />
      <PerformanceChart data={data.performanceOverTime} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ContentRankingList title="Top Performing Content" items={data.topContent} emptyMessage="Belum ada data performa konten." />
        <ContentRankingList title="Worst Performing Content" items={data.worstContent} emptyMessage="Belum ada data performa konten." />
      </div>
    </div>
  );
}
