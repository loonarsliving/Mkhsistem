"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { deleteWorkScheduleAction } from "../actions/work-schedule.actions";
import type { WorkScheduleInput } from "../schemas/attendance.schema";
import { WorkScheduleFormDialog } from "./work-schedule-form-dialog";

const WEEKDAY_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

interface WorkScheduleRow {
  id: string;
  branch_id: string | null;
  name: string;
  start_time: string;
  end_time: string;
  late_tolerance_minutes: number;
  work_days: number[];
  is_default: boolean;
  branches: { name: string } | null;
}

export function WorkScheduleTable({ schedules }: { schedules: WorkScheduleRow[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    const result = await deleteWorkScheduleAction(deletingId);
    setDeleting(false);
    setDeletingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus jadwal kerja");
      return;
    }
    toast.success("Jadwal kerja dihapus");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <WorkScheduleFormDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Tambah Jadwal
            </Button>
          }
        />
      </div>

      {schedules.length === 0 ? (
        <EmptyState icon={CalendarClock} title="Belum ada jadwal kerja" />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Cabang</TableHead>
              <TableHead>Jam Kerja</TableHead>
              <TableHead>Toleransi</TableHead>
              <TableHead>Hari Kerja</TableHead>
              <TableHead>Default</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {schedules.map((schedule) => {
              const formValues: WorkScheduleInput = {
                id: schedule.id,
                branchId: schedule.branch_id,
                name: schedule.name,
                startTime: schedule.start_time.slice(0, 5),
                endTime: schedule.end_time.slice(0, 5),
                lateToleranceMinutes: schedule.late_tolerance_minutes,
                workDays: schedule.work_days,
                isDefault: schedule.is_default,
              };
              return (
                <TableRow key={schedule.id}>
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell>{schedule.branches?.name ?? "Semua Cabang"}</TableCell>
                  <TableCell className="tabular-nums">
                    {schedule.start_time.slice(0, 5)} – {schedule.end_time.slice(0, 5)}
                  </TableCell>
                  <TableCell>{schedule.late_tolerance_minutes} menit</TableCell>
                  <TableCell>{schedule.work_days.map((d) => WEEKDAY_LABELS[d]).join(", ")}</TableCell>
                  <TableCell>{schedule.is_default ? "Ya" : "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <WorkScheduleFormDialog
                        initialValues={formValues}
                        trigger={
                          <Button variant="ghost" size="icon" aria-label="Edit">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <Button variant="ghost" size="icon" aria-label="Hapus" onClick={() => setDeletingId(schedule.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(deletingId)}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Hapus jadwal kerja?"
        description="Tindakan ini tidak dapat dibatalkan."
        destructive
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
