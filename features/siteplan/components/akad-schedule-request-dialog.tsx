"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Upload } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { uploadUserFile } from "@/lib/supabase/storage";

import { requestAkadScheduleAction } from "../actions/siteplan.actions";
import { akadScheduleRequestSchema, type AkadScheduleRequestInput } from "../schemas/siteplan.schema";

interface AkadScheduleRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  purchaseId: string;
  initialBuyer: { buyerName: string; nik: string; phone: string; address: string };
  onRequested: () => void;
}

/**
 * "Jadwalkan Akad": collects/completes the buyer's KTP + data, then requestAkadScheduleAction
 * snapshots it, resolves the active notary contact, and sends both the data and the KTP photo
 * to the notary via WhatsApp immediately. The KTP file itself is uploaded here (client-side,
 * same own-folder-then-server-action pattern as attendance selfies/avatars) BEFORE calling the
 * action, since the action only accepts an already-uploaded storage path.
 */
export function AkadScheduleRequestDialog({ open, onOpenChange, userId, purchaseId, initialBuyer, onRequested }: AkadScheduleRequestDialogProps) {
  const [ktpFile, setKtpFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AkadScheduleRequestInput>({
    resolver: zodResolver(akadScheduleRequestSchema),
    defaultValues: { purchaseId, ...initialBuyer, ktpPhotoPath: "", tanggalAkad: "", notes: "" },
  });

  React.useEffect(() => {
    if (open) {
      reset({ purchaseId, ...initialBuyer, ktpPhotoPath: "", tanggalAkad: "", notes: "" });
      setKtpFile(null);
    }
  }, [open, purchaseId, initialBuyer, reset]);

  async function onSubmit(values: AkadScheduleRequestInput) {
    if (!ktpFile) {
      toast.error("Foto KTP wajib diunggah");
      return;
    }

    setUploading(true);
    let ktpPhotoPath: string;
    try {
      const uploaded = await uploadUserFile(STORAGE_BUCKETS.KTP_PHOTOS, userId, ktpFile, ktpFile.name);
      ktpPhotoPath = uploaded.path;
    } catch (err) {
      setUploading(false);
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto KTP");
      return;
    }
    setUploading(false);

    const result = await requestAkadScheduleAction({ ...values, ktpPhotoPath });
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim jadwal akad");
      return;
    }
    toast.success(`Data dan KTP telah dikirim ke ${result.data?.notarisName ?? "notaris"} melalui WhatsApp`);
    onOpenChange(false);
    onRequested();
  }

  const busy = isSubmitting || uploading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Jadwalkan Akad</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="buyerName">Nama Pembeli</Label>
              <Input id="buyerName" {...register("buyerName")} />
              {errors.buyerName && <p className="text-sm text-destructive">{errors.buyerName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="nik">NIK</Label>
              <Input id="nik" {...register("nik")} maxLength={16} />
              {errors.nik && <p className="text-sm text-destructive">{errors.nik.message}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Telepon</Label>
              <Input id="phone" {...register("phone")} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="tanggalAkad">Tanggal Akad Diusulkan</Label>
              <Input id="tanggalAkad" type="date" {...register("tanggalAkad")} />
              {errors.tanggalAkad && <p className="text-sm text-destructive">{errors.tanggalAkad.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">Alamat</Label>
            <Textarea id="address" rows={2} {...register("address")} />
            {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="ktp">Foto KTP</Label>
            <Input id="ktp" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setKtpFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">Foto KTP akan dikirim langsung ke notaris melalui WhatsApp bersama data pembeli.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan untuk notaris (opsional)</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Kirim ke Notaris
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
