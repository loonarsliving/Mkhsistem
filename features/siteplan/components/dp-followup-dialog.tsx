"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { recordSiteplanDpFollowupAction } from "../actions/siteplan.actions";
import { siteplanDpFollowupSchema, type SiteplanDpFollowupInput } from "../schemas/siteplan.schema";

interface DpFollowupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchaseId: string;
  onRecorded: () => void;
}

const EMPTY_VALUES = { dpAmount: undefined, handoverDate: "", pelunasanAmount: undefined, notes: "" };

/**
 * One-off correction path (0273): a verified Booking Fee purchase can move to DP once the buyer
 * pays more on top of the booking fee. Resubmits the purchase to Finance's pending queue --
 * it does not claim a fee itself (DP still isn't fee-claimable, only Akad is, per 0204).
 */
const dpFormSchema = siteplanDpFollowupSchema.omit({ purchaseId: true });

export function DpFollowupDialog({ open, onOpenChange, purchaseId, onRecorded }: DpFollowupDialogProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof dpFormSchema>, unknown, z.output<typeof dpFormSchema>>({
    resolver: zodResolver(dpFormSchema),
    defaultValues: EMPTY_VALUES,
  });

  React.useEffect(() => {
    if (open) reset(EMPTY_VALUES);
  }, [open, reset]);

  async function onSubmit(values: Omit<SiteplanDpFollowupInput, "purchaseId">) {
    const result = await recordSiteplanDpFollowupAction({ purchaseId, ...values });
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat lanjutan DP");
      return;
    }
    toast.success("Lanjutan DP dicatat — menunggu verifikasi Finance");
    onOpenChange(false);
    onRecorded();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lanjutkan ke DP</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Catat pembayaran DP yang diterima setelah booking fee. Pembelian akan kembali masuk antrean verifikasi Finance sebagai
          transaksi DP.
        </p>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="dpAmount">Nominal DP</Label>
            <Controller control={control} name="dpAmount" render={({ field }) => <CurrencyInput id="dpAmount" value={field.value as number | undefined} onValueChange={field.onChange} />} />
            {errors.dpAmount && <p className="text-sm text-destructive">{errors.dpAmount.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="pelunasanAmount">Sisa Pelunasan (opsional)</Label>
            <Controller
              control={control}
              name="pelunasanAmount"
              render={({ field }) => <CurrencyInput id="pelunasanAmount" value={field.value as number | undefined} onValueChange={field.onChange} />}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="handoverDate">Tanggal Serah Terima</Label>
            <Input id="handoverDate" type="date" {...register("handoverDate")} />
            {errors.handoverDate && <p className="text-sm text-destructive">{errors.handoverDate.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Catatan (opsional)</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
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
