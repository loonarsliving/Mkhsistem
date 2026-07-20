"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { AlarmClock, CheckCircle2, Circle, ClipboardList, Clock, Percent, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { StatTile } from "@/components/shared/stat-tile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { KpiTaskStatusDb } from "@/types/database.types";

import { completeTaskAction, submitTaskObstacleAction } from "../actions/markom.actions";
import { listKpiTasksAction, teamStatsAction } from "../actions/markom-query.actions";

const STATUS_ICON: Record<KpiTaskStatusDb, React.ReactNode> = {
  pending: <Circle className="h-5 w-5 text-muted-foreground" />,
  awaiting_verification: <Clock className="h-5 w-5 text-warning" />,
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
  assignee_response: string | null;
  ai_guidance: string | null;
  verifier: { full_name: string } | null;
}

interface TeamChecklistSectionProps {
  /** Filters to one Content Planner product tab (leasehold_sales/occupancy) instead of every task -- omitted on /markom, which still shows the team's whole checklist undifferentiated. */
  focus?: "leasehold_sales" | "occupancy";
  title?: string;
}

/**
 * A team member's own view of their team's shared checklist. Any member of
 * the task's team can check off a still-pending task themselves
 * (kpi_complete_task) -- the Branch Manager's separate Approve/Needs
 * Revision review (TaskReviewBoard) is for a different concern (correcting
 * a wrongly-completed task) and is untouched by this.
 */
export function TeamChecklistSection({ focus, title }: TeamChecklistSectionProps = {}) {
  const now = new Date();
  const [month] = React.useState(now.getMonth() + 1);
  const [year] = React.useState(now.getFullYear());
  const [week, setWeek] = React.useState<number | "all">("all");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [obstacleOpenId, setObstacleOpenId] = React.useState<string | null>(null);
  const [obstacleText, setObstacleText] = React.useState("");
  const [submittingObstacle, setSubmittingObstacle] = React.useState(false);
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["markom-team-stats", month, year],
    queryFn: () => teamStatsAction(undefined, month, year),
  });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ["markom-team-tasks", month, year, week, focus],
    queryFn: () =>
      listKpiTasksAction({
        periodYear: year,
        periodMonth: month,
        periodWeek: week === "all" ? undefined : week,
        contentFocus: focus,
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

  async function handleSubmitObstacle(taskId: string) {
    if (obstacleText.trim().length < 5) {
      toast.error("Jelaskan kendala Anda (minimal 5 karakter)");
      return;
    }
    setSubmittingObstacle(true);
    const result = await submitTaskObstacleAction({ taskId, response: obstacleText.trim() });
    setSubmittingObstacle(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim kendala");
      return;
    }
    toast.success(result.data?.aiResponded ? "Kendala terkirim, AI sudah merespons" : "Kendala tersimpan, tapi AI belum sempat merespons -- coba lagi nanti");
    setObstacleOpenId(null);
    setObstacleText("");
    queryClient.invalidateQueries({ queryKey: ["markom-team-tasks"] });
  }

  const items = tasks ?? [];
  const currentWeek = stats?.current_week ?? 1;
  const teamMembers = (stats?.team_members as unknown as { employee_id: string; full_name: string }[] | null) ?? [];

  // stats (kpi_team_stats) counts the whole team's checklist, not any one
  // Content Planner tab -- when focus is set, the 4 numbers below must come
  // from the already-focus-filtered items instead, or they'd overcount.
  const focusedTotal = items.length;
  const focusedCompleted = items.filter((t) => t.status === "completed").length;
  const focusedRemaining = items.filter((t) => t.status === "pending").length;
  const focusedAchievement = focusedTotal > 0 ? Math.round((focusedCompleted / focusedTotal) * 100) : 0;

  const totalTasks = focus ? focusedTotal : week === "all" ? stats?.monthly_total ?? 0 : stats?.weekly_total ?? 0;
  const completedTasks = focus ? focusedCompleted : week === "all" ? stats?.monthly_completed ?? 0 : stats?.weekly_completed ?? 0;
  const remainingTasks = focus ? focusedRemaining : week === "all" ? stats?.monthly_remaining ?? 0 : stats?.weekly_remaining ?? 0;
  const achievement = focus ? focusedAchievement : week === "all" ? stats?.monthly_achievement_percent ?? 0 : stats?.weekly_achievement_percent ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle className="text-base">{title ?? (stats ? `Tim Markom — ${stats.branch_name}` : "Checklist Tim Markom")}</CardTitle>
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
              <StatTile icon={ClipboardList} label="Total Tasks" value={String(totalTasks)} />
              <StatTile icon={CheckCircle2} label="Completed Tasks" value={String(completedTasks)} tone="success" />
              <StatTile
                icon={AlarmClock}
                label="Remaining Tasks"
                value={String(remainingTasks)}
                tone={remainingTasks > 0 ? "warning" : "default"}
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
                  {task.status === "awaiting_verification" && (
                    <p className="text-xs text-warning">Menunggu persetujuan Kepala Cabang.</p>
                  )}
                  {task.notes && task.status === "rejected" && <p className="text-xs text-destructive">Catatan: {task.notes}</p>}

                  {task.assignee_response && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Kendala Anda:</span> {task.assignee_response}
                    </p>
                  )}
                  {task.ai_guidance && (
                    <p className="rounded-md bg-muted/50 p-2 text-xs text-foreground">
                      <span className="font-medium">Jawaban AI:</span> {task.ai_guidance}
                    </p>
                  )}

                  {task.status === "pending" &&
                    (obstacleOpenId === task.id ? (
                      <div className="space-y-1.5 pt-1">
                        <Textarea
                          value={obstacleText}
                          onChange={(e) => setObstacleText(e.target.value)}
                          placeholder="Jelaskan kondisi/kendala Anda dalam mengerjakan brief ini -- AI akan merespons: merevisi brief atau memberi saran penyelesaian."
                          rows={3}
                          disabled={submittingObstacle}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" disabled={submittingObstacle} onClick={() => handleSubmitObstacle(task.id)}>
                            Kirim ke AI
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={submittingObstacle}
                            onClick={() => {
                              setObstacleOpenId(null);
                              setObstacleText("");
                            }}
                          >
                            Batal
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="link"
                        className="h-auto p-0 text-xs"
                        onClick={() => {
                          setObstacleOpenId(task.id);
                          setObstacleText("");
                        }}
                      >
                        Ada kendala mengerjakan ini?
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
