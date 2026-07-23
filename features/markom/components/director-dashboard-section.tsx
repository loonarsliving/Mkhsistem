import Link from "next/link";
import { CheckCircle2, ClipboardList, Percent, Users } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { nationalStatsAction } from "../actions/markom-query.actions";

interface BranchRankingRow {
  branch_id: string;
  branch_name: string;
  assigned: number;
  completed: number;
  achievement_percent: number;
}

/** Director's national rollup: team (branch) ranking only -- no per-person ranking, teams are the unit of measurement now. */
export function DirectorDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const branchRanking = (stats.branch_ranking ?? []) as unknown as BranchRankingRow[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Markom — Ringkasan Nasional</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/markom/ranking">Ranking Lengkap</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Users} label="Tim Markom" value={String(stats.team_count)} />
          <StatTile icon={ClipboardList} label="Task Bulan Ini" value={String(stats.monthly_total)} />
          <StatTile icon={CheckCircle2} label="Selesai" value={String(stats.monthly_completed)} tone="success" />
          <StatTile icon={Percent} label="Achievement" value={`${stats.monthly_achievement_percent}%`} tone="success" />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Ranking Tim (Achievement %)</p>
          <ol className="space-y-1.5">
            {branchRanking.map((b, i) => (
              <li key={b.branch_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                  Tim Markom {b.branch_name}
                </span>
                <span className="font-medium tabular-nums">{b.achievement_percent}%</span>
              </li>
            ))}
            {branchRanking.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
