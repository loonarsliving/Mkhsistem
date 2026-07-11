"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Users } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";

import { setBranchTargetAction } from "../actions/crm.actions";
import { listBranchSalesTargetsAction } from "../actions/crm-query.actions";
import { setBranchTargetSchema, type SetBranchTargetInput } from "../schemas/crm.schema";

const MONTH_LABEL = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function SalesTargetForm() {
  const now = new Date();
  const [month, setMonth] = React.useState(now.getMonth() + 1);
  const [year, setYear] = React.useState(now.getFullYear());
  const queryClient = useQueryClient();

  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction });
  const { data: branchTargets, isLoading } = useQuery({
    queryKey: ["crm-branch-targets", month, year],
    queryFn: () => listBranchSalesTargetsAction(month, year),
  });

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SetBranchTargetInput>({
    resolver: zodResolver(setBranchTargetSchema),
    defaultValues: { branchId: "", periodMonth: month, periodYear: year, targetUnits: 0, commissionPercent: 0 },
  });

  const watchedBranchId = watch("branchId");
  const activeSalesCount = branchTargets?.find((b) => b.branch_id === watchedBranchId)?.active_sales_count ?? 0;
  const watchedTargetUnits = watch("targetUnits");

  React.useEffect(() => {
    reset({ branchId: "", periodMonth: month, periodYear: year, targetUnits: 0, commissionPercent: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  async function onSubmit(values: SetBranchTargetInput) {
    const result = await setBranchTargetAction({ ...values, periodMonth: month, periodYear: year });
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan target cabang");
      return;
    }
    const count = result.data?.distributedCount ?? 0;
    toast.success(
      count > 0
        ? `Target berhasil didistribusikan ke ${count} Sales aktif`
        : "Target cabang disimpan. Belum ada Sales aktif di cabang ini untuk didistribusikan.",
    );
    queryClient.invalidateQueries({ queryKey: ["crm-branch-targets", month, year] });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Set Target Cabang</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Cabang</Label>
                <Controller
                  control={control}
                  name="branchId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
                {errors.branchId && <p className="text-sm text-destructive">{errors.branchId.message}</p>}
                {watchedBranchId && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {activeSalesCount} Sales aktif di cabang ini
                    {activeSalesCount > 0 && watchedTargetUnits > 0 && (
                      <> — perkiraan {Math.floor(watchedTargetUnits / activeSalesCount)} unit/Sales</>
                    )}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Bulan</Label>
                  <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
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
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tahun</Label>
                  <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="targetUnits">Target Unit</Label>
                <Input id="targetUnits" type="number" min={0} {...register("targetUnits")} />
                {errors.targetUnits && <p className="text-sm text-destructive">{errors.targetUnits.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="commissionPercent">Komisi (%)</Label>
                <Input id="commissionPercent" type="number" min={0} max={100} step="0.5" {...register("commissionPercent")} />
                {errors.commissionPercent && <p className="text-sm text-destructive">{errors.commissionPercent.message}</p>}
              </div>
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              <Save className="h-4 w-4" /> Simpan &amp; Distribusikan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Target Cabang — {MONTH_LABEL[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isLoading && (branchTargets ?? []).length === 0 ? (
            <EmptyState icon={Users} title="Belum ada cabang" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cabang</TableHead>
                    <TableHead className="text-right">Target Unit</TableHead>
                    <TableHead className="text-right">Komisi</TableHead>
                    <TableHead className="text-right">Sales Aktif</TableHead>
                    <TableHead className="text-right">Unit/Sales</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(branchTargets ?? []).map((row) => (
                    <TableRow key={row.branch_id}>
                      <TableCell className="font-medium">{row.branch_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.has_target ? row.target_units : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.has_target ? `${row.commission_percent}%` : "-"}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.active_sales_count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.has_target && row.active_sales_count > 0 ? Math.floor(row.target_units / row.active_sales_count) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
