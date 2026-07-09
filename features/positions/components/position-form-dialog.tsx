"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
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
import { Switch } from "@/components/ui/switch";

import { savePositionAction } from "../actions/position.actions";
import { positionSchema, type PositionInput } from "../schemas/position.schema";

interface PositionFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: PositionInput;
}

export function PositionFormDialog({ trigger, initialValues }: PositionFormDialogProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PositionInput>({
    resolver: zodResolver(positionSchema),
    defaultValues: initialValues ?? { code: "", name: "", level: 100, description: "", isActive: true },
  });

  async function onSubmit(values: PositionInput) {
    const result = await savePositionAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan jabatan");
      return;
    }
    toast.success("Jabatan berhasil disimpan");
    setOpen(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Jabatan" : "Tambah Jabatan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="name">Nama Jabatan</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="code">Kode</Label>
              <Input id="code" {...register("code")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="level">Level Hierarki</Label>
              <Input id="level" type="number" min={1} max={999} {...register("level")} />
              <p className="text-xs text-muted-foreground">Angka lebih kecil = jabatan lebih tinggi</p>
            </div>
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
