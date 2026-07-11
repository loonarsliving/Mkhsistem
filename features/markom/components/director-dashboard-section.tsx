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

interface EmployeeRankingRow {
  employee_id: string;
  full_name: string;
  branch_name: string;
  assigned: number;
  completed: number;
  achievement_percent: number;
}

export function DirectorDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof nationalStatsAction>> }) {
  if (!stats) return null;
  const branchRanking = (stats.branch_ranking ?? []) as unknown as BranchRankingRow[];
  const topEmployeesMonthly = (stats.employee_ranking_monthly ?? []) as unknown as EmployeeRankingRow[];

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
          <StatTile icon={Users} label="Karyawan Markom" value={String(stats.employee_count)} />
          <StatTile icon={ClipboardList} label="Task Bulan Ini" value={String(stats.monthly_assigned)} />
          <StatTile icon={CheckCircle2} label="Selesai" value={String(stats.monthly_completed)} tone="success" />
          <StatTile icon={Percent} label="Achievement" value={`${stats.monthly_achievement_percent}%`} tone="success" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Ranking Cabang (Achievement %)</p>
            <ol className="space-y-1.5">
              {branchRanking.map((b, i) => (
                <li key={b.branch_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    {b.branch_name}
                  </span>
                  <span className="font-medium tabular-nums">{b.achievement_percent}%</span>
                </li>
              ))}
              {branchRanking.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
            </ol>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Top Karyawan Markom (Bulanan)</p>
            <ol className="space-y-1.5">
              {topEmployeesMonthly.map((e, i) => (
                <li key={e.employee_id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                    <span>
                      {e.full_name}
                      <span className="ml-1 text-xs text-muted-foreground">({e.branch_name})</span>
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{e.achievement_percent}%</span>
                </li>
              ))}
              {topEmployeesMonthly.length === 0 && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
            </ol>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
