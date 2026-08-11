"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { saveSiteplanUnitAction } from "../actions/siteplan.actions";
import { siteplanUnitSchema, type SiteplanUnitInput } from "../schemas/siteplan.schema";

interface SiteplanUnitFormDialogProps {
  trigger: React.ReactNode;
  projectId: string;
  initialValues?: SiteplanUnitInput;
  onSaved: () => void;
}

export function SiteplanUnitFormDialog({ trigger, projectId, initialValues, onSaved }: SiteplanUnitFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteplanUnitInput>({
    resolver: zodResolver(siteplanUnitSchema),
    defaultValues: initialValues ?? { projectId, blok: "", tipe: "" },
  });

  React.useEffect(() => {
    if (open) reset(initialValues ?? { projectId, blok: "", tipe: "" });
  }, [open, initialValues, projectId, reset]);

  async function onSubmit(values: SiteplanUnitInput) {
    const result = await saveSiteplanUnitAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan unit");
      return;
    }
    toast.success("Unit berhasil disimpan");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Unit" : "Tambah Unit"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="blok">Kode Unit / Blok</Label>
              <Input id="blok" {...register("blok")} />
              {errors.blok && <p className="text-sm text-destructive">{errors.blok.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipe">Tipe</Label>
              <Input id="tipe" {...register("tipe")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="harga">Harga</Label>
              <Controller control={control} name="harga" render={({ field }) => <CurrencyInput id="harga" value={field.value} onValueChange={field.onChange} />} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="luas">Luas (m²)</Label>
              <Input id="luas" type="number" step="0.01" {...register("luas")} />
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
