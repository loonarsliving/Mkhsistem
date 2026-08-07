"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HardHat, Loader2, ShoppingBag, Users } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { submitConstructionExpenseAction } from "../actions/construction-finance.actions";
import { submitConstructionExpenseSchema, type SubmitConstructionExpenseInput } from "../schemas/construction-finance.schema";

interface ConstructionExpenseFormProps {
  projectId: string;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function ConstructionExpenseForm({ projectId }: ConstructionExpenseFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubmitConstructionExpenseInput>({
    resolver: zodResolver(submitConstructionExpenseSchema),
    defaultValues: {
      projectId,
      expenseType: "gaji_tukang",
      partyName: "",
      amount: undefined,
      description: "",
      expenseDate: today(),
    },
  });

  const expenseType = watch("expenseType");
  const isGajiTukang = expenseType === "gaji_tukang";

  async function onSubmit(values: SubmitConstructionExpenseInput) {
    const result = await submitConstructionExpenseAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan input");
      return;
    }
    toast.success(isGajiTukang ? "Gaji tukang tercatat" : "Pembelian material (utang) tercatat, Super Admin diberi notifikasi");
    reset({ projectId, expenseType, partyName: "", amount: undefined, description: "", expenseDate: today() });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          Input Keuangan Proyek
        </CardTitle>
        <CardDescription>
          Catat gaji tukang (dibayar tunai dari dana proyek) atau pembelian material (selalu dicatat sebagai utang ke toko bangunan).
          Super Admin menerima notifikasi setiap kali Anda menginput.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-2">
            <Controller
              control={control}
              name="expenseType"
              render={({ field }) => (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => field.onChange("gaji_tukang")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      field.value === "gaji_tukang" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <Users className="h-4 w-4" />
                    Gaji Tukang
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => field.onChange("pembelian_material")}
                    className={cn(
                      "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                      field.value === "pembelian_material" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                    )}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Pembelian Material (Utang Toko)
                  </button>
                </>
              )}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{isGajiTukang ? "Nama Tukang" : "Nama Toko Bangunan"}</Label>
              <Input
                placeholder={isGajiTukang ? "contoh: Pak Amir" : "contoh: Toko Bangunan Sinar Jaya"}
                disabled={isSubmitting}
                {...register("partyName")}
              />
              <FieldError message={errors.partyName?.message} />
            </div>
            <div className="space-y-1.5">
              <Label>Tanggal</Label>
              <Input type="date" disabled={isSubmitting} {...register("expenseDate")} />
              <FieldError message={errors.expenseDate?.message} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nominal</Label>
            <Controller
              control={control}
              name="amount"
              render={({ field }) => (
                <CurrencyInput value={field.value} onValueChange={field.onChange} placeholder="contoh: 1.500.000" disabled={isSubmitting} />
              )}
            />
            <FieldError message={errors.amount?.message} />
            {!isGajiTukang && <p className="text-xs text-muted-foreground">Nominal ini otomatis dicatat sebagai utang ke toko, bukan mengurangi dana tunai proyek.</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea placeholder="mis. jenis pekerjaan / daftar material…" rows={2} disabled={isSubmitting} {...register("description")} />
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <HardHat className="mr-1 h-4 w-4" />}
            Simpan
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
