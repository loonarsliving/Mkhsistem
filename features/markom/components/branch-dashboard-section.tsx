import Link from "next/link";
import { CheckCircle2, ClipboardList, Users } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { branchStatsAction } from "../actions/markom-query.actions";

interface EmployeePerformance {
  employee_id: string;
  full_name: string;
  monthly_assigned: number;
  monthly_completed: number;
  monthly_achievement_percent: number;
}

export function BranchDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof branchStatsAction>> }) {
  if (!stats) return null;
  const performance = (stats.employee_performance ?? []) as unknown as EmployeePerformance[];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Markom — Ringkasan Cabang</CardTitle>
        <Button asChild variant="outline" size="sm">
          <Link href="/markom">Review Task</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Users} label="Karyawan Markom" value={String(stats.employee_count)} />
          <StatTile icon={ClipboardList} label="Task Bulan Ini" value={String(stats.monthly_assigned)} />
          <StatTile icon={CheckCircle2} label="Achievement" value={`${stats.monthly_achievement_percent}%`} tone="success" />
          <StatTile
            icon={ClipboardList}
            label="Menunggu Verifikasi"
            value={String(stats.pending_verification_count)}
            tone={stats.pending_verification_count > 0 ? "warning" : "default"}
          />
        </div>

        {performance.length > 0 && (
          <ol className="space-y-1.5">
            {performance.map((p) => (
              <li key={p.employee_id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{p.full_name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {p.monthly_completed}/{p.monthly_assigned}
                  </span>
                  <Progress value={p.monthly_achievement_percent} tone="success" className="w-16" />
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
