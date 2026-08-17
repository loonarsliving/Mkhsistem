"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Send } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { syncTukangBorongonAction } from "../actions/construction-finance.actions";
import { syncTukangBorongonSchema, type SyncTukangBorongonInput } from "../schemas/construction-finance.schema";

const PROYEK_OPTIONS: { value: SyncTukangBorongonInput["proyek"]; label: string }[] = [
  { value: "LL", label: "LL — Loonars Jogja" },
  { value: "AFP", label: "AFP — Kendari" },
  { value: "IH", label: "IH — Makassar" },
  { value: "GCI", label: "GCI — Jabodetabek" },
  { value: "GCR", label: "GCR — Jabodetabek" },
];

const emptyValues: SyncTukangBorongonInput = {
  proyek: "LL",
  blok: "",
  nama: "",
  item: "",
  nilaiKontrak: 0,
  terbayar: 0,
  totalUnit: undefined,
  hargaPerUnit: undefined,
  unitSelesai: undefined,
  ket: "",
};

export function TukangBorongonSyncCard() {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SyncTukangBorongonInput>({
    resolver: zodResolver(syncTukangBorongonSchema),
    defaultValues: emptyValues,
  });

  async function onSubmit(values: SyncTukangBorongonInput) {
    const result = await syncTukangBorongonAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengirim ke mkh-properti");
      return;
    }
    toast.success(`Data ${values.nama} (blok ${values.blok || "-"}) dikirim ke mkh-properti`);
    reset({ ...emptyValues, proyek: values.proyek });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sisa Kontrak Tukang — Proyek Berjalan</CardTitle>
        <CardDescription>
          Untuk proyek yang sudah berjalan di mkh-properti (misalnya Loonars Jogja). Input manual sisa kontrak per blok di sini, otomatis dikirim ke sistem
          mkh-properti (tukang_borongan) tanpa perlu input ulang di sana.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Proyek</Label>
              <Controller
                control={control}
                name="proyek"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={isSubmitting}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih proyek" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROYEK_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>
                          {p.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.proyek && <p className="text-sm text-destructive">{errors.proyek.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Blok</Label>
              <Input placeholder="contoh: A1" disabled={isSubmitting} {...register("blok")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nama Tukang</Label>
            <Input placeholder="contoh: Pak Slamet" disabled={isSubmitting} {...register("nama")} />
            {errors.nama && <p className="text-sm text-destructive">{errors.nama.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Item / Pekerjaan (opsional)</Label>
            <Input placeholder="contoh: Borongan struktur blok A1" disabled={isSubmitting} {...register("item")} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nilai Kontrak</Label>
              <Controller
                control={control}
                name="nilaiKontrak"
                render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />}
              />
              {errors.nilaiKontrak && <p className="text-sm text-destructive">{errors.nilaiKontrak.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Sudah Terbayar</Label>
              <Controller
                control={control}
                name="terbayar"
                render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />}
              />
              {errors.terbayar && <p className="text-sm text-destructive">{errors.terbayar.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Total Unit (opsional)</Label>
              <Input type="number" min="0" step="1" placeholder="-" disabled={isSubmitting} {...register("totalUnit", { valueAsNumber: true })} />
              {errors.totalUnit && <p className="text-sm text-destructive">{errors.totalUnit.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Harga per Unit (opsional)</Label>
              <Controller
                control={control}
                name="hargaPerUnit"
                render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />}
              />
              {errors.hargaPerUnit && <p className="text-sm text-destructive">{errors.hargaPerUnit.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Unit Selesai (opsional)</Label>
              <Input type="number" min="0" step="1" placeholder="-" disabled={isSubmitting} {...register("unitSelesai", { valueAsNumber: true })} />
              {errors.unitSelesai && <p className="text-sm text-destructive">{errors.unitSelesai.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Keterangan (opsional)</Label>
            <Textarea rows={2} placeholder="Catatan tambahan" disabled={isSubmitting} {...register("ket")} />
          </div>

          <p className="text-xs text-muted-foreground">
            Kalau tukang + blok ini sudah ada di mkh-properti, datanya akan diperbarui (bukan dobel). Kalau belum ada, akan dibuat baru.
          </p>

          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
              Kirim ke mkh-properti
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
