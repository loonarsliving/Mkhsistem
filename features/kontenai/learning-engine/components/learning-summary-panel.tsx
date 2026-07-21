import { CheckCircle2, Gauge, Lightbulb, ListChecks, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/shared/stat-tile";
import type { LearningSummary } from "@/features/kontenai/learning-engine/types";

function ThemeList({ themes, emptyLabel }: { themes: LearningSummary["topWhatWorked"]; emptyLabel: string }) {
  if (themes.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <ul className="space-y-2">
      {themes.map((theme) => (
        <li key={theme.phrase} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-foreground">{theme.phrase}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
            {theme.count}x
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Top-of-page stats + recurring theme cards, derived from getLearningSummaryAction. */
export function LearningSummaryPanel({ summary }: { summary: LearningSummary }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile icon={Gauge} label="Skor Rata-rata" value={`${summary.averageScore.toFixed(1)}/10`} tone="default" />
        <StatTile
          icon={CheckCircle2}
          label="Tingkat Persetujuan"
          value={`${Math.round(summary.approvalRate * 100)}%`}
          tone={summary.approvalRate >= 0.6 ? "success" : "warning"}
        />
        <StatTile icon={ListChecks} label="Total Catatan Pembelajaran" value={String(summary.totalRecords)} tone="default" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <CardTitle className="text-sm font-medium">Yang Paling Sering Berhasil</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeList themes={summary.topWhatWorked} emptyLabel="Belum ada pola yang berulang." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-2">
            <Lightbulb className="h-4 w-4 text-warning" />
            <CardTitle className="text-sm font-medium">Yang Paling Sering Perlu Diperbaiki</CardTitle>
          </CardHeader>
          <CardContent>
            <ThemeList themes={summary.topWhatToImprove} emptyLabel="Belum ada pola yang berulang." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
