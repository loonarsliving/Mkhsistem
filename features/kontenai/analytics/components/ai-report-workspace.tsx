"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listAiReportsAction } from "@/features/kontenai/analytics/actions/analytics.actions";
import { AI_REPORTS_QUERY_KEY, useGenerateAiReport } from "@/features/kontenai/analytics/hooks/use-analytics-mutations";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}

/** Spec item 8: "AI Report" -- generate a weekly or monthly narrative summary grounded in real KPIs, and browse every past report. */
export function AiReportWorkspace() {
  const [period, setPeriod] = React.useState<"weekly" | "monthly">("weekly");

  const { data: reports, isLoading, isError, error, refetch } = useQuery({
    queryKey: AI_REPORTS_QUERY_KEY,
    queryFn: listAiReportsAction,
  });

  const generateMutation = useGenerateAiReport();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-primary" />
            Generate AI Report
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as "weekly" | "monthly")}>
            <TabsList>
              <TabsTrigger value="weekly">Mingguan</TabsTrigger>
              <TabsTrigger value="monthly">Bulanan</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button type="button" disabled={generateMutation.isPending} onClick={() => generateMutation.mutate(period)}>
            {generateMutation.isPending ? "Merangkum performa..." : `Generate Laporan ${period === "weekly" ? "Mingguan" : "Bulanan"}`}
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
              <p className="font-medium">Gagal memuat riwayat laporan</p>
              <p className="text-xs">{error instanceof Error ? error.message : "Terjadi kesalahan"}</p>
              <button type="button" className="mt-1 text-xs underline" onClick={() => refetch()}>
                Coba lagi
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (reports ?? []).length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Belum ada laporan</p>
            <p className="max-w-sm text-sm text-muted-foreground">Generate laporan setelah ada data performa konten pada periode terkait.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(reports ?? []).map((report) => (
            <Card key={report.id}>
              <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{report.period === "weekly" ? "Mingguan" : "Bulanan"}</Badge>
                  {formatDate(report.period_start)} -- {formatDate(report.period_end)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Total Content: {report.total_content}</span>
                  <span>Published: {report.published_content}</span>
                  <span>Views: {report.total_views}</span>
                  <span>Reach: {report.total_reach}</span>
                  <span>Engagement Rate: {report.engagement_rate}%</span>
                  {report.avg_ctr !== null && <span>CTR: {report.avg_ctr}%</span>}
                  {report.total_leads !== null && <span>Leads: {report.total_leads}</span>}
                  {report.conversion_rate !== null && <span>Conversion: {report.conversion_rate}%</span>}
                </div>
                <p className="text-sm">{report.summary}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
