"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { AlarmClock, CheckCircle2, Circle, ClipboardList, Percent, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { StatTile } from "@/components/shared/stat-tile";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { KpiTaskStatusDb } from "@/types/database.types";

import { completeTaskAction } from "../actions/markom.actions";
import { listKpiTasksAction, teamStatsAction } from "../actions/markom-query.actions";

const STATUS_ICON: Record<KpiTaskStatusDb, React.ReactNode> = {
  pending: <Circle className="h-5 w-5 text-muted-foreground" />,
  completed: <CheckCircle2 className="h-5 w-5 text-success" />,
  rejected: <XCircle className="h-5 w-5 text-destructive" />,
};

interface KpiTaskRow {
  id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: KpiTaskStatusDb;
  period_week: number;
  notes: string | null;
  verifier: { full_name: string } | null;
}

/**
 * A team member's own view of their team's shared checklist. Any member of
 * the task's team can check off a still-pending task themselves
 * (kpi_complete_task) -- the Branch Manager's separate Approve/Needs
 * Revision review (TaskReviewBoard) is for a different concern (correcting
 * a wrongly-completed task) and is untouched by this.
 */
export function TeamChecklistSection() {
  const now = new Date();
  const [month] = React.useState(now.getMonth() + 1);
  const [year] = React.useState(now.getFullYear());
  const [week, setWeek] = React.useState<number | "all">("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["markom-team-stats", month, year],
    queryFn: () => teamStatsAction(undefined, month, year),
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["markom-team-tasks", month, year, week],
    queryFn: () =>
      listKpiTasksAction({
        periodYear: year,
        periodMonth: month,
        periodWeek: week === "all" ? undefined : week,
      }) as Promise<KpiTaskRow[]>,
  });

  async function handleComplete(taskId: string) {
    setBusyId(taskId);
    const result = await completeTaskAction({ taskId });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menandai task selesai");
      return;
    }
    toast.success("Task ditandai selesai");
    queryClient.invalidateQueries({ queryKey: ["markom-team-stats"] });
    queryClient.invalidateQueries({ queryKey: ["markom-team-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["markom-national-stats"] });
    queryClient.invalidateQueries({ queryKey: ["markom-ranking"] });
  }

  const items = tasks ?? [];
  const currentWeek = stats?.current_week ?? 1;
  const teamMembers = (stats?.team_members as unknown as { employee_id: string; full_name: string }[] | null) ?? [];
  const achievement = week === "all" ? stats?.monthly_achievement_percent ?? 0 : stats?.weekly_achievement_percent ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{stats ? `Tim Markom — ${stats.branch_name}` : "Checklist Tim Markom"}</CardTitle>
        <Select value={String(week)} onValueChange={(v) => setWeek(v === "all" ? "all" : Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Bulan Ini</SelectItem>
            {[1, 2, 3, 4, 5].map((w) => (
              <SelectItem key={w} value={String(w)}>
                Minggu {w} {w === currentWeek ? "(Sekarang)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats && (
          <>
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {teamMembers.length > 0 ? teamMembers.map((m) => m.full_name).join(", ") : "Belum ada anggota tim aktif."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={ClipboardList} label="Total Tasks" value={String(week === "all" ? stats.monthly_total : stats.weekly_total)} />
              <StatTile
                icon={CheckCircle2}
                label="Completed Tasks"
                value={String(week === "all" ? stats.monthly_completed : stats.weekly_completed)}
                tone="success"
              />
              <StatTile
                icon={AlarmClock}
                label="Remaining Tasks"
                value={String(week === "all" ? stats.monthly_remaining : stats.weekly_remaining)}
                tone={(week === "all" ? stats.monthly_remaining : stats.weekly_remaining) > 0 ? "warning" : "default"}
              />
              <StatTile icon={Percent} label={week === "all" ? "Monthly Achievement" : "Weekly Achievement"} value={`${achievement}%`} tone="success" />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Progress {week === "all" ? "Bulanan" : `Minggu ${week}`}</span>
                <span className="tabular-nums">{achievement}%</span>
              </div>
              <Progress value={achievement} tone="success" />
            </div>
          </>
        )}

        {!isLoading && items.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Belum ada task" description="Task checklist dari Branch Manager akan muncul di sini." />
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {items.map((task) => (
              <li key={task.id} className="flex items-start gap-3 p-3">
                <span className="mt-0.5 shrink-0">
                  {task.status === "pending" ? (
                    <Checkbox
                      checked={false}
                      disabled={busyId === task.id}
                      onCheckedChange={(checked) => checked === true && handleComplete(task.id)}
                      aria-label={`Tandai selesai: ${task.title}`}
                    />
                  ) : (
                    STATUS_ICON[task.status]
                  )}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className={cn("text-sm font-medium", task.status === "rejected" && "text-muted-foreground line-through")}>
                    {task.title}
                  </p>
                  {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Minggu {task.period_week}</span>
                    {task.due_date && <span>Tenggat {format(new Date(task.due_date), "d MMM yyyy", { locale: idLocale })}</span>}
                    {task.verifier && <span>Direview {task.verifier.full_name}</span>}
                  </div>
                  {task.notes && task.status === "rejected" && <p className="text-xs text-destructive">Catatan: {task.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
