"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { saveNotarisAction } from "../actions/siteplan.actions";
import { notarisContactSchema, type NotarisContactInput } from "../schemas/siteplan.schema";

interface NotarisContactFormDialogProps {
  trigger: React.ReactNode;
  initialValues?: NotarisContactInput;
  onSaved: () => void;
}

const EMPTY_VALUES: NotarisContactInput = { fullName: "", phone: "", notes: "" };

/** loonars_akad_schedule_request always picks the most recently created row with active = true -- there is no explicit "primary" flag, so only one active contact should normally exist at a time (the manager list surfaces this via the active/inactive Switch). */
export function NotarisContactFormDialog({ trigger, initialValues, onSaved }: NotarisContactFormDialogProps) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NotarisContactInput>({
    resolver: zodResolver(notarisContactSchema),
    defaultValues: initialValues ?? EMPTY_VALUES,
  });

  React.useEffect(() => {
    if (open) reset(initialValues ?? EMPTY_VALUES);
  }, [open, initialValues, reset]);

  async function onSubmit(values: NotarisContactInput) {
    const result = await saveNotarisAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan kontak notaris");
      return;
    }
    toast.success("Kontak notaris berhasil disimpan");
    setOpen(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initialValues ? "Edit Kontak Notaris" : "Tambah Kontak Notaris"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nama Notaris</Label>
            <Input id="fullName" {...register("fullName")} placeholder="Contoh: Siti Aminah, S.H., M.Kn." />
            {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Nomor WhatsApp</Label>
            <Input id="phone" {...register("phone")} placeholder="081234567890" />
            {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            <p className="text-xs text-muted-foreground">Data pembeli, KTP, dan tanggal akad usulan akan dikirim ke nomor ini melalui WhatsApp.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan (opsional)</Label>
            <Textarea id="notes" {...register("notes")} rows={2} />
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
