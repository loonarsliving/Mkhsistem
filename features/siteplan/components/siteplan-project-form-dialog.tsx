"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listBranchesAction } from "@/features/branches/actions/branch-query.actions";

import { saveSiteplanProjectAction } from "../actions/siteplan.actions";
import { siteplanProjectSchema, type SiteplanProjectInput } from "../schemas/siteplan.schema";

interface SiteplanProjectFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: SiteplanProjectInput;
  onSaved: () => void;
}

const EMPTY_VALUES: SiteplanProjectInput = { kode: "", nama: "", branchId: "", lokasi: "", warna: "" };

/**
 * Cabang is required (0262): every siteplan project is exclusively visible/bookable by its own
 * branch's Sales/Kepala Cabang, so there is no more "visible to every branch" default the way
 * Cendana and Loonars 2 both were before this picker existed.
 */
export function SiteplanProjectFormDialog({ trigger, initialValues, onSaved }: SiteplanProjectFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const { data: branches } = useQuery({ queryKey: ["branches"], queryFn: listBranchesAction, enabled: open });
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteplanProjectInput>({
    resolver: zodResolver(siteplanProjectSchema),
    defaultValues: initialValues ?? EMPTY_VALUES,
  });

  React.useEffect(() => {
    if (open) reset(initialValues ?? EMPTY_VALUES);
  }, [open, initialValues, reset]);

  async function onSubmit(values: SiteplanProjectInput) {
    const result = await saveSiteplanProjectAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan project");
      return;
    }
    toast.success("Project berhasil disimpan");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Project Siteplan" : "Tambah Project Siteplan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="kode">Kode</Label>
              <Input id="kode" {...register("kode")} />
              {errors.kode && <p className="text-sm text-destructive">{errors.kode.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nama">Nama Project</Label>
              <Input id="nama" {...register("nama")} />
              {errors.nama && <p className="text-sm text-destructive">{errors.nama.message}</p>}
            </div>
          </div>
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
            <p className="text-xs text-muted-foreground">Project ini hanya akan tampil untuk Sales/Kepala Cabang di cabang yang dipilih.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lokasi">Lokasi</Label>
              <Input id="lokasi" {...register("lokasi")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warna">Warna (opsional, untuk aksen UI)</Label>
              <Input id="warna" {...register("warna")} placeholder="#22c55e" />
            </div>
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
