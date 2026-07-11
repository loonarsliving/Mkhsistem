"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, ClipboardList, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatTile } from "@/components/shared/stat-tile";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { KpiTaskStatusDb } from "@/types/database.types";

import { verifyTaskAction } from "../actions/markom.actions";
import { branchStatsAction, listKpiTasksAction } from "../actions/markom-query.actions";

interface EmployeePerformance {
  employee_id: string;
  full_name: string;
  weekly_assigned: number;
  weekly_completed: number;
  weekly_achievement_percent: number;
  monthly_assigned: number;
  monthly_completed: number;
  monthly_achievement_percent: number;
  overdue: number;
}

interface KpiTaskRow {
  id: string;
  title: string;
  due_date: string | null;
  period_week: number;
  status: KpiTaskStatusDb;
  assignee: { full_name: string } | null;
}

export function TaskReviewBoard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["markom-branch-stats", month, year],
    queryFn: () => branchStatsAction(undefined, month, year),
  });

  const { data: pendingTasks, isLoading } = useQuery({
    queryKey: ["markom-pending-tasks", month, year],
    queryFn: () => listKpiTasksAction({ periodYear: year, periodMonth: month, status: "pending" }) as Promise<KpiTaskRow[]>,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["markom-branch-stats"] });
    queryClient.invalidateQueries({ queryKey: ["markom-pending-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["markom-national-stats"] });
    queryClient.invalidateQueries({ queryKey: ["markom-ranking"] });
  }

  async function handleComplete(taskId: string) {
    setBusyId(taskId);
    const result = await verifyTaskAction({ taskId, status: "completed" });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyelesaikan task");
      return;
    }
    toast.success("Task ditandai selesai");
    invalidate();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await verifyTaskAction({ taskId: rejectTarget, status: "rejected", notes: rejectNotes || undefined });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak task");
      return;
    }
    toast.success("Task ditolak");
    setRejectTarget(null);
    setRejectNotes("");
    invalidate();
  }

  const performance = (stats?.employee_performance as unknown as EmployeePerformance[] | null) ?? [];
  const tasks = pendingTasks ?? [];

  return (
    <div className="space-y-6">
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Markom — Branch Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile icon={Users} label="Karyawan Markom" value={String(stats.employee_count)} />
              <StatTile icon={ClipboardList} label="Task Bulan Ini" value={String(stats.monthly_assigned)} />
              <StatTile icon={CheckCircle2} label="Achievement" value={`${stats.monthly_achievement_percent}%`} tone="success" />
              <StatTile
                icon={XCircle}
                label="Menunggu Verifikasi"
                value={String(stats.pending_verification_count)}
                tone={stats.pending_verification_count > 0 ? "warning" : "default"}
              />
            </div>

            {performance.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Karyawan</TableHead>
                      <TableHead className="text-right">Minggu Ini</TableHead>
                      <TableHead className="text-right">Bulan Ini</TableHead>
                      <TableHead className="text-right">Terlambat</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {performance.map((p) => (
                      <TableRow key={p.employee_id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {p.weekly_completed}/{p.weekly_assigned}
                            </span>
                            <Progress value={p.weekly_achievement_percent} tone="success" className="w-16" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="tabular-nums text-xs text-muted-foreground">
                              {p.monthly_completed}/{p.monthly_assigned}
                            </span>
                            <Progress value={p.monthly_achievement_percent} tone="success" className="w-16" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.overdue > 0 ? p.overdue : "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Menunggu Verifikasi</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {!isLoading && tasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tidak ada task menunggu" description="Semua task Markom sudah diverifikasi." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Minggu</TableHead>
                    <TableHead>Tenggat</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>{task.assignee?.full_name ?? "-"}</TableCell>
                      <TableCell>Minggu {task.period_week}</TableCell>
                      <TableCell>
                        {task.due_date ? format(new Date(task.due_date), "d MMM yyyy", { locale: idLocale }) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busyId === task.id} onClick={() => handleComplete(task.id)}>
                            <CheckCircle2 className="h-4 w-4" /> Selesai
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={busyId === task.id}
                            onClick={() => setRejectTarget(task.id)}
                          >
                            <XCircle className="h-4 w-4" /> Tolak
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title="Tolak task ini?"
        description="Task akan ditandai Ditolak dan tidak dihitung sebagai selesai pada Achievement karyawan."
        confirmLabel="Tolak Task"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Alasan penolakan (opsional)" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={2} />
      </ConfirmDialog>
    </div>
  );
}
