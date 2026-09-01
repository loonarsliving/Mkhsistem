"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { Loader2, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/shared/stat-tile";
import { EmptyState } from "@/components/shared/empty-state";

import { getLatestMonthlyReportAction, triggerMonthlyReportAction } from "../actions/social.actions";

interface MonthlyReportPayload {
  monthLabel: string;
  followersStart: number | null;
  followersEnd: number | null;
  followerGrowthPct: number | null;
  avgWeeklyScore: number | null;
  bestWeek: { weekStart: string; overall: number } | null;
  worstWeek: { weekStart: string; overall: number } | null;
  weeksCovered: number;
  recommendations: string[];
}

interface MonthlyReportRow {
  month_start: string;
  narrative: string;
  report: unknown;
}

const QUERY_KEY = ["markom-monthly-report"];

/**
 * Monthly rollup of the weekly content audits (0251) -- follower growth,
 * average weekly score, and best/worst week are all computed in code
 * (process-job route) before the AI ever sees them; the AI only narrates
 * and recommends. Property only (leasehold_sales + occupancy share one
 * account), auto-generated on the 1st of each month.
 */
export function MonthlyReportCard({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [triggering, setTriggering] = React.useState(false);

  const { data, isLoading } = useQuery<MonthlyReportRow | null>({ queryKey: QUERY_KEY, queryFn: getLatestMonthlyReportAction });

  async function handleTrigger() {
    setTriggering(true);
    const result = await triggerMonthlyReportAction();
    setTriggering(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat laporan bulanan");
      return;
    }
    toast.success("Laporan bulanan sedang diproses AI, hasil akan muncul di sini dalam beberapa saat");
    setTimeout(() => queryClient.invalidateQueries({ queryKey: QUERY_KEY }), 8000);
  }

  const report = data?.report as unknown as MonthlyReportPayload | undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Laporan Bulanan AI</CardTitle>
        {canManage && (
          <Button size="sm" variant="outline" disabled={triggering} onClick={handleTrigger}>
            {triggering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Buat Laporan Sekarang
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && !data && (
          <EmptyState
            icon={Sparkles}
            title="Belum ada laporan bulanan"
            description="Laporan otomatis dibuat tiap tanggal 1, atau klik 'Buat Laporan Sekarang' setelah ada evaluasi mingguan bulan ini."
          />
        )}
        {data && report && (
          <>
            <p className="text-xs text-muted-foreground">
              {report.monthLabel} &middot; dari {report.weeksCovered} evaluasi mingguan &middot; disimpan {format(new Date(data.month_start), "d MMM yyyy", { locale: idLocale })}
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              <StatTile
                icon={report.followerGrowthPct !== null && report.followerGrowthPct < 0 ? TrendingDown : TrendingUp}
                label="Pertumbuhan Followers"
                value={report.followerGrowthPct !== null ? `${report.followerGrowthPct > 0 ? "+" : ""}${report.followerGrowthPct}%` : "-"}
              />
              <StatTile icon={Sparkles} label="Rata-rata Skor Mingguan" value={report.avgWeeklyScore !== null ? `${report.avgWeeklyScore}/10` : "-"} />
              <StatTile
                icon={TrendingUp}
                label="Minggu Terbaik"
                value={report.bestWeek ? `${format(new Date(report.bestWeek.weekStart), "d MMM", { locale: idLocale })} (${report.bestWeek.overall}/10)` : "-"}
              />
            </div>
            <p className="text-sm text-muted-foreground">{data.narrative}</p>
            {report.recommendations.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">Rekomendasi Bulan Depan</p>
                <ul className="ml-5 list-disc space-y-1 text-sm text-muted-foreground">
                  {report.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
