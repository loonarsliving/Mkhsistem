"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";

import { assignChecklistAction } from "../actions/markom.actions";
import { listMarkomEmployeesAction } from "../actions/markom-query.actions";
import { assignChecklistSchema, type AssignChecklistInput } from "../schemas/markom.schema";

const MONTH_LABEL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface AssignChecklistFormProps {
  canPickBranch: boolean;
  defaultBranchId: string;
}

export function AssignChecklistForm({ canPickBranch, defaultBranchId }: AssignChecklistFormProps) {
  const now = new Date();
  const [branchId, setBranchId] = React.useState(defaultBranchId);
  const queryClient = useQueryClient();

  const { data: branches } = useQuery({
    queryKey: ["branches"],
    queryFn: listBranchesAction,
    enabled: canPickBranch,
  });
  const { data: employees, isLoading: loadingEmployees } = useQuery({
    queryKey: ["markom-employees", branchId],
    queryFn: () => listMarkomEmployeesAction(branchId),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AssignChecklistInput>({
    resolver: zodResolver(assignChecklistSchema),
    defaultValues: {
      assignedTo: "",
      periodYear: now.getFullYear(),
      periodMonth: now.getMonth() + 1,
      periodWeek: 1,
      items: [{ title: "", description: "", dueDate: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  async function onSubmit(values: AssignChecklistInput) {
    const result = await assignChecklistAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menugaskan checklist");
      return;
    }
    toast.success(`${result.data?.taskIds.length ?? 0} task berhasil ditugaskan`);
    reset({
      assignedTo: values.assignedTo,
      periodYear: values.periodYear,
      periodMonth: values.periodMonth,
      periodWeek: values.periodWeek,
      items: [{ title: "", description: "", dueDate: "" }],
    });
    queryClient.invalidateQueries({ queryKey: ["markom-my-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["markom-pending-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["markom-branch-stats"] });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tugaskan Checklist Mingguan</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            {canPickBranch && (
              <div className="space-y-2">
                <Label>Cabang</Label>
                <Select value={branchId} onValueChange={setBranchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cabang" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches?.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Karyawan Markom</Label>
              <Controller
                control={control}
                name="assignedTo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingEmployees ? "Memuat..." : "Pilih karyawan"} />
                    </SelectTrigger>
                    <SelectContent>
                      {employees?.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.assignedTo && <p className="text-sm text-destructive">{errors.assignedTo.message}</p>}
              {!loadingEmployees && employees?.length === 0 && (
                <p className="text-xs text-muted-foreground">Belum ada karyawan aktif di divisi Marketing & Komunikasi untuk cabang ini.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Bulan</Label>
              <Controller
                control={control}
                name="periodMonth"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABEL.map((label, i) => (
                        <SelectItem key={label} value={String(i + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tahun</Label>
              <Input type="number" {...register("periodYear")} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Minggu</Label>
              <Controller
                control={control}
                name="periodWeek"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((w) => (
                        <SelectItem key={w} value={String(w)}>
                          Minggu {w}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label>Checklist Task</Label>
            {fields.map((field, index) => (
              <div key={field.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <Input placeholder="Judul task, mis. 5 Instagram Reels" {...register(`items.${index}.title`)} />
                    {errors.items?.[index]?.title && (
                      <p className="text-sm text-destructive">{errors.items[index]?.title?.message}</p>
                    )}
                    <Textarea placeholder="Deskripsi (opsional)" rows={2} {...register(`items.${index}.description`)} />
                    <Input type="date" {...register(`items.${index}.dueDate`)} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="text-destructive"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {errors.items?.message && <p className="text-sm text-destructive">{errors.items.message}</p>}
            <Button type="button" variant="outline" onClick={() => append({ title: "", description: "", dueDate: "" })}>
              <Plus className="h-4 w-4" /> Tambah Task
            </Button>
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            <Save className="h-4 w-4" /> Tugaskan Checklist
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
