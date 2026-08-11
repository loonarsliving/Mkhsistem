"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SITEPLAN_PAYMENT_METHOD_LABEL, SITEPLAN_TRANSACTION_TYPE_LABEL } from "@/constants/app";

import { submitSiteplanPurchaseAction } from "../actions/siteplan.actions";
import { siteplanPurchaseSchema, type SiteplanPurchaseInput } from "../schemas/siteplan.schema";

interface UnitPurchaseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  unitBlok: string;
  onSubmitted: () => void;
}

export function UnitPurchaseForm({ open, onOpenChange, unitId, unitBlok, onSubmitted }: UnitPurchaseFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SiteplanPurchaseInput>({
    resolver: zodResolver(siteplanPurchaseSchema),
    defaultValues: {
      unitId,
      buyerName: "",
      nik: "",
      phone: "",
      address: "",
      transactionType: "booking",
      paymentMethod: "cash",
    },
  });

  React.useEffect(() => {
    if (open) reset({ unitId, buyerName: "", nik: "", phone: "", address: "", transactionType: "booking", paymentMethod: "cash" });
  }, [open, unitId, reset]);

  const transactionType = watch("transactionType");

  async function onSubmit(values: SiteplanPurchaseInput) {
    const result = await submitSiteplanPurchaseAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengajukan pembelian");
      return;
    }
    toast.success("Pembelian diajukan — menunggu verifikasi Finance");
    onOpenChange(false);
    onSubmitted();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajukan Pembelian — Unit {unitBlok}</DialogTitle>
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
              <Input id="nik" {...register("nik")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="phone">Telepon</Label>
              <Input id="phone" {...register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Alamat</Label>
              <Input id="address" {...register("address")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tipe Transaksi</Label>
              <Controller
                control={control}
                name="transactionType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih tipe" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SITEPLAN_TRANSACTION_TYPE_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.transactionType && <p className="text-sm text-destructive">{errors.transactionType.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Metode Pembayaran</Label>
              <Controller
                control={control}
                name="paymentMethod"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih metode" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SITEPLAN_PAYMENT_METHOD_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.paymentMethod && <p className="text-sm text-destructive">{errors.paymentMethod.message}</p>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">{transactionType === "akad" ? "Harga (Lunas)" : "Harga"}</Label>
            <Controller
              control={control}
              name="price"
              render={({ field }) => <CurrencyInput id="price" value={field.value} onValueChange={field.onChange} />}
            />
            {errors.price && <p className="text-sm text-destructive">{errors.price.message}</p>}
          </div>

          {transactionType === "booking" && (
            <div className="space-y-2">
              <Label htmlFor="bookingFee">Booking Fee</Label>
              <Controller
                control={control}
                name="bookingFee"
                render={({ field }) => <CurrencyInput id="bookingFee" value={field.value} onValueChange={field.onChange} />}
              />
              {errors.bookingFee && <p className="text-sm text-destructive">{errors.bookingFee.message}</p>}
            </div>
          )}

          {transactionType === "dp" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="dpAmount">Nominal DP</Label>
                <Controller
                  control={control}
                  name="dpAmount"
                  render={({ field }) => <CurrencyInput id="dpAmount" value={field.value} onValueChange={field.onChange} />}
                />
                {errors.dpAmount && <p className="text-sm text-destructive">{errors.dpAmount.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="pelunasanAmount">Pelunasan</Label>
                <Controller
                  control={control}
                  name="pelunasanAmount"
                  render={({ field }) => <CurrencyInput id="pelunasanAmount" value={field.value} onValueChange={field.onChange} />}
                />
              </div>
            </div>
          )}

          {(transactionType === "dp" || transactionType === "akad") && (
            <div className="space-y-2">
              <Label htmlFor="handoverDate">Tanggal Serah Terima</Label>
              <Input id="handoverDate" type="date" {...register("handoverDate")} />
              {errors.handoverDate && <p className="text-sm text-destructive">{errors.handoverDate.message}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Catatan (opsional)</Label>
            <Textarea id="notes" rows={2} {...register("notes")} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajukan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
