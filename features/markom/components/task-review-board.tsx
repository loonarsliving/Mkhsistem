"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, ClipboardList, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/shared/stat-tile";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { KpiTaskStatusDb } from "@/types/database.types";

import { verifyTaskAction } from "../actions/markom.actions";
import { listKpiTasksAction, teamStatsAction } from "../actions/markom-query.actions";

interface KpiTaskRow {
  id: string;
  title: string;
  due_date: string | null;
  period_week: number;
  status: KpiTaskStatusDb;
}

/** Branch Manager's review board: one team's checklist, approve/reject the whole task at once -- never per-person. */
export function TaskReviewBoard() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const queryClient = useQueryClient();
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const { data: stats } = useQuery({
    queryKey: ["markom-team-stats", month, year],
    queryFn: () => teamStatsAction(undefined, month, year),
  });

  const { data: pendingTasks, isLoading } = useQuery({
    queryKey: ["markom-pending-tasks", month, year],
    queryFn: () => listKpiTasksAction({ periodYear: year, periodMonth: month, status: "awaiting_verification" }) as Promise<KpiTaskRow[]>,
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["markom-team-stats"] });
    queryClient.invalidateQueries({ queryKey: ["markom-pending-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["markom-national-stats"] });
    queryClient.invalidateQueries({ queryKey: ["markom-ranking"] });
  }

  async function handleApprove(taskId: string) {
    setBusyId(taskId);
    const result = await verifyTaskAction({ taskId, status: "completed" });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyetujui task");
      return;
    }
    toast.success("Task disetujui, seluruh anggota tim diberi tahu");
    invalidate();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await verifyTaskAction({ taskId: rejectTarget, status: "rejected", notes: rejectNotes || undefined });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menandai task perlu revisi");
      return;
    }
    toast.success("Task ditandai perlu revisi");
    setRejectTarget(null);
    setRejectNotes("");
    invalidate();
  }

  const tasks = pendingTasks ?? [];
  const teamMembers = (stats?.team_members as unknown as { employee_id: string; full_name: string }[] | null) ?? [];

  return (
    <div className="space-y-6">
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tim Markom — {stats.branch_name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {teamMembers.length > 0 ? teamMembers.map((m) => m.full_name).join(", ") : "Belum ada anggota tim aktif."}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatTile icon={ClipboardList} label="Total Tasks" value={String(stats.monthly_total)} />
              <StatTile icon={CheckCircle2} label="Completed Tasks" value={String(stats.monthly_completed)} tone="success" />
              <StatTile icon={ClipboardList} label="Remaining Tasks" value={String(stats.monthly_remaining)} />
              <StatTile icon={CheckCircle2} label="Weekly Achievement" value={`${stats.weekly_achievement_percent}%`} tone="success" />
              <StatTile icon={CheckCircle2} label="Monthly Achievement" value={`${stats.monthly_achievement_percent}%`} tone="success" />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks Waiting Review</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {!isLoading && tasks.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Tidak ada task menunggu" description="Belum ada task yang ditandai selesai oleh tim yang menunggu persetujuan Anda." />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Minggu</TableHead>
                    <TableHead>Tenggat</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell>Minggu {task.period_week}</TableCell>
                      <TableCell>
                        {task.due_date ? format(new Date(task.due_date), "d MMM yyyy", { locale: idLocale }) : "-"}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" disabled={busyId === task.id} onClick={() => handleApprove(task.id)}>
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive"
                            disabled={busyId === task.id}
                            onClick={() => setRejectTarget(task.id)}
                          >
                            <XCircle className="h-4 w-4" /> Needs Revision
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
        title="Task ini perlu revisi?"
        description="Task akan ditandai Needs Revision dan tidak dihitung selesai pada Achievement tim."
        confirmLabel="Needs Revision"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Catatan revisi (opsional)" value={rejectNotes} onChange={(e) => setRejectNotes(e.target.value)} rows={2} />
      </ConfirmDialog>
    </div>
  );
}
