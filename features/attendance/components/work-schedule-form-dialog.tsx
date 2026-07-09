"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";

import { saveWorkScheduleAction } from "../actions/work-schedule.actions";
import { workScheduleSchema, type WorkScheduleInput } from "../schemas/attendance.schema";

const WEEKDAYS = [
  { value: 1, label: "Sen" },
  { value: 2, label: "Sel" },
  { value: 3, label: "Rab" },
  { value: 4, label: "Kam" },
  { value: 5, label: "Jum" },
  { value: 6, label: "Sab" },
  { value: 0, label: "Min" },
];

interface WorkScheduleFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: WorkScheduleInput;
}

export function WorkScheduleFormDialog({ trigger, initialValues }: WorkScheduleFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction, enabled: open });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WorkScheduleInput>({
    resolver: zodResolver(workScheduleSchema),
    defaultValues: initialValues ?? {
      branchId: null,
      name: "",
      startTime: "08:00",
      endTime: "17:00",
      lateToleranceMinutes: 15,
      workDays: [1, 2, 3, 4, 5],
      isDefault: false,
    },
  });

  async function onSubmit(values: WorkScheduleInput) {
    const result = await saveWorkScheduleAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan jadwal kerja");
      return;
    }
    toast.success("Jadwal kerja berhasil disimpan");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Jadwal Kerja" : "Tambah Jadwal Kerja"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Nama Jadwal</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label>Cabang (kosongkan untuk berlaku di semua cabang)</Label>
            <Controller
              control={control}
              name="branchId"
              render={({ field }) => (
                <Select value={field.value ?? "all"} onValueChange={(v) => field.onChange(v === "all" ? null : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Cabang</SelectItem>
                    {branches?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="startTime">Jam Masuk</Label>
              <Input id="startTime" type="time" {...register("startTime")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endTime">Jam Pulang</Label>
              <Input id="endTime" type="time" {...register("endTime")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="lateToleranceMinutes">Toleransi Keterlambatan (menit)</Label>
            <Input id="lateToleranceMinutes" type="number" min={0} max={180} {...register("lateToleranceMinutes")} />
          </div>

          <div className="space-y-2">
            <Label>Hari Kerja</Label>
            <Controller
              control={control}
              name="workDays"
              render={({ field }) => (
                <div className="flex flex-wrap gap-3">
                  {WEEKDAYS.map((day) => (
                    <label key={day.value} className="flex items-center gap-1.5 text-sm">
                      <Checkbox
                        checked={field.value.includes(day.value)}
                        onCheckedChange={(checked) => {
                          field.onChange(
                            checked ? [...field.value, day.value] : field.value.filter((d) => d !== day.value),
                          );
                        }}
                      />
                      {day.label}
                    </label>
                  ))}
                </div>
              )}
            />
            {errors.workDays && <p className="text-sm text-destructive">{errors.workDays.message}</p>}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="isDefault" className="cursor-pointer">
              Jadikan jadwal default
            </Label>
            <Controller
              control={control}
              name="isDefault"
              render={({ field }) => <Switch id="isDefault" checked={field.value} onCheckedChange={field.onChange} />}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
