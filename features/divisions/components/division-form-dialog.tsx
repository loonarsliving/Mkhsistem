"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

import { saveDivisionAction } from "../actions/division.actions";
import { divisionSchema, type DivisionInput } from "../schemas/division.schema";

interface DivisionFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: DivisionInput;
}

export function DivisionFormDialog({ trigger, initialValues }: DivisionFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction, enabled: open });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<DivisionInput>({
    resolver: zodResolver(divisionSchema),
    defaultValues: initialValues ?? { branchId: null, code: "", name: "", description: "", isActive: true },
  });

  async function onSubmit(values: DivisionInput) {
    const result = await saveDivisionAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan divisi");
      return;
    }
    toast.success("Divisi berhasil disimpan");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Divisi" : "Tambah Divisi"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Nama Divisi</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Kode</Label>
            <Input id="code" {...register("code")} />
          </div>
          <div className="space-y-2">
            <Label>Cabang (kosongkan jika berlaku di semua cabang)</Label>
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
          <div className="space-y-2">
            <Label htmlFor="description">Deskripsi</Label>
            <Input id="description" {...register("description")} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="isActive" className="cursor-pointer">
              Aktif
            </Label>
            <Controller control={control} name="isActive" render={({ field }) => <Switch id="isActive" checked={field.value} onCheckedChange={field.onChange} />} />
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
