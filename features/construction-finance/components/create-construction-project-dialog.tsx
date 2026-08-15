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
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CreateConstructionProjectInput>({
    resolver: zodResolver(createConstructionProjectSchema),
    defaultValues: { branchId: "", name: "", totalBudget: undefined },
  });

  async function onSubmit(values: CreateConstructionProjectInput) {
    const result = await createConstructionProjectAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal membuat proyek");
      return;
    }
    toast.success("Proyek pembangunan dibuat -- WBS standar sudah otomatis disiapkan");
    reset({ branchId: "", name: "", totalBudget: undefined });
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
            <Input placeholder="contoh: Pembangunan Cabang Makassar" disabled={isSubmitting} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Total Anggaran</Label>
            <Controller
              control={control}
              name="totalBudget"
              render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />}
            />
            {errors.totalBudget && <p className="text-sm text-destructive">{errors.totalBudget.message}</p>}
          </div>
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
