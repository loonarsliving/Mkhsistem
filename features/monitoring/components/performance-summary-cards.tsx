"use client";

import { useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { getPerformanceSummaryAction } from "@/features/monitoring/actions/monitoring-query.actions";

const METRIC_UNIT: Record<string, string> = {
  CLS: "",
  FCP: "ms",
  FID: "ms",
  INP: "ms",
  LCP: "ms",
  TTFB: "ms",
};

function ratingForP75(metric: string, value: number): BadgeProps["variant"] {
  // Thresholds follow Google's Core Web Vitals "good" boundaries.
  const goodMax: Record<string, number> = { CLS: 0.1, FCP: 1800, FID: 100, INP: 200, LCP: 2500, TTFB: 800 };
  const poorMin: Record<string, number> = { CLS: 0.25, FCP: 3000, FID: 300, INP: 500, LCP: 4000, TTFB: 1800 };
  if (value <= (goodMax[metric] ?? Infinity)) return "success";
  if (value >= (poorMin[metric] ?? Infinity)) return "destructive";
  return "warning";
}

export function PerformanceSummaryCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["performance-summary"],
    queryFn: getPerformanceSummaryAction,
  });

  const rows = data ?? [];

  if (!isLoading && rows.length === 0) {
    return (
      <EmptyState
        icon={Gauge}
        title="Belum ada data performa"
        description="Metrik Web Vitals akan muncul di sini setelah pengguna mengakses aplikasi."
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {rows.map((row) => (
        <Card key={row.metric_name}>
          <CardContent className="space-y-1 p-4">
            <p className="text-xs font-medium text-muted-foreground">{row.metric_name}</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-semibold tabular-nums">{row.p75_value.toFixed(row.metric_name === "CLS" ? 3 : 0)}</span>
              <span className="text-xs text-muted-foreground">{METRIC_UNIT[row.metric_name]}</span>
            </div>
            <Badge variant={ratingForP75(row.metric_name, row.p75_value)} className="text-[10px]">
              p75 · {row.sample_count} sampel
            </Badge>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
