import Link from "next/link";
import { AlarmClock, CheckCircle2, ClipboardList, Percent } from "lucide-react";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { employeeStatsAction } from "../actions/markom-query.actions";

export function EmployeeDashboardSection({ stats }: { stats: Awaited<ReturnType<typeof employeeStatsAction>> }) {
  if (!stats) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">Markom — Checklist Saya</CardTitle>
        <Button asChild size="sm">
          <Link href="/markom">Lihat Checklist</Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={ClipboardList} label="Task Hari Ini" value={String(stats.today_tasks)} />
          <StatTile icon={CheckCircle2} label="Selesai Minggu Ini" value={`${stats.weekly_completed}/${stats.weekly_assigned}`} tone="success" />
          <StatTile icon={Percent} label="Achievement Bulanan" value={`${stats.monthly_achievement_percent}%`} tone="success" />
          <StatTile
            icon={AlarmClock}
            label="Task Terlambat"
            value={String(stats.overdue_count)}
            tone={stats.overdue_count > 0 ? "destructive" : "default"}
          />
        </div>
      </CardContent>
    </Card>
  );
}
