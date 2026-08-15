"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/utils";

import { createConstructionProjectAction } from "../actions/construction-finance.actions";
import { createConstructionProjectSchema, type CreateConstructionProjectInput } from "../schemas/construction-finance.schema";

interface CreateConstructionProjectDialogProps {
  branches: { id: string; name: string }[];
}

export function CreateConstructionProjectDialog({ branches }: CreateConstructionProjectDialogProps) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateConstructionProjectInput>({
    resolver: zodResolver(createConstructionProjectSchema),
    defaultValues: { branchId: "", name: "", budgetPerUnit: undefined, totalUnits: undefined },
  });

  const budgetPerUnit = watch("budgetPerUnit");
  const totalUnits = watch("totalUnits");
  const totalBudget = budgetPerUnit && totalUnits ? budgetPerUnit * totalUnits : null;

  async function onSubmit(values: CreateConstructionProjectInput) {
    const result = await createConstructionProjectAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat proyek");
      return;
    }
    toast.success(`Proyek dibuat dengan ${values.totalUnits} unit -- lanjutkan isi BOQ di kartu "BOQ Proyek" di bawah`);
    reset({ branchId: "", name: "", budgetPerUnit: undefined, totalUnits: undefined });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          <Plus className="mr-1 h-4 w-4" />
          Proyek Baru
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buat Proyek Pembangunan Baru</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <Label>Cabang</Label>
            <Controller
              control={control}
              name="branchId"
              render={({ field }) => (
                <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isSubmitting}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih cabang" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.branchId && <p className="text-sm text-destructive">{errors.branchId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Nama Proyek</Label>
            <Input placeholder="contoh: Loonars Villa Jogja" disabled={isSubmitting} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Anggaran per Unit</Label>
              <Controller
                control={control}
                name="budgetPerUnit"
                render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />}
              />
              {errors.budgetPerUnit && <p className="text-sm text-destructive">{errors.budgetPerUnit.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Jumlah Unit</Label>
              <Input type="number" min="1" step="1" placeholder="contoh: 18" disabled={isSubmitting} {...register("totalUnits", { valueAsNumber: true })} />
              {errors.totalUnits && <p className="text-sm text-destructive">{errors.totalUnits.message}</p>}
            </div>
          </div>
          {totalBudget !== null && (
            <p className="text-sm text-muted-foreground">
              Total anggaran proyek: <span className="font-medium text-foreground">{formatCurrency(totalBudget)}</span> ({totalUnits} unit x{" "}
              {formatCurrency(budgetPerUnit)})
            </p>
          )}
          <p className="text-xs text-muted-foreground">Setiap unit langsung dibuat sebagai baris terpisah (U01, U02, dst) dengan anggaran masing-masing.</p>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Buat Proyek
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
