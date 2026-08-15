"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Coins, HardHat, Loader2, PackageOpen, ShoppingBag, Users } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { MaterialCatalogItem } from "@/repositories/cm-material.repository";

import { submitConstructionExpenseAction } from "../actions/construction-finance.actions";
import { submitConstructionExpenseSchema, type SubmitConstructionExpenseInput } from "../schemas/construction-finance.schema";

interface ConstructionExpenseFormProps {
  projectId: string;
  materials: MaterialCatalogItem[];
}

type ExpenseType = SubmitConstructionExpenseInput["expenseType"];
type Category = "gaji_tukang" | "material" | "lain_lain";

/**
 * Category (what) x payment method (how it's paid) -- gaji_tukang has no
 * payment choice (always cash), material and lain_lain each have a cash and
 * an utang variant. Kept as a lookup instead of branching everywhere the
 * final expenseType is needed.
 */
const CATEGORY_TO_EXPENSE_TYPE: Record<Category, { cash: ExpenseType; utang: ExpenseType }> = {
  gaji_tukang: { cash: "gaji_tukang", utang: "gaji_tukang" },
  material: { cash: "material_tunai", utang: "pembelian_material" },
  lain_lain: { cash: "lain_lain_tunai", utang: "pembelian_lain_lain" },
};

function expenseTypeToCategory(type: ExpenseType): Category {
  if (type === "gaji_tukang") return "gaji_tukang";
  if (type === "material_tunai" || type === "pembelian_material") return "material";
  return "lain_lain";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function FieldError({ message }: { message: string | undefined }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

const TOAST_MESSAGE: Record<ExpenseType, string> = {
  gaji_tukang: "Gaji tukang tercatat",
  material_tunai: "Pembelian material (tunai) tercatat, Super Admin diberi notifikasi",
  pembelian_material: "Pembelian material (utang) tercatat, Super Admin diberi notifikasi",
  lain_lain_tunai: "Pembelian lain-lain (tunai) tercatat, Super Admin diberi notifikasi",
  pembelian_lain_lain: "Pembelian lain-lain (utang) tercatat, Super Admin diberi notifikasi",
};

export function ConstructionExpenseForm({ projectId, materials }: ConstructionExpenseFormProps) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
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
      materialId: "",
      quantity: undefined,
    },
  });

  const expenseType = watch("expenseType");
  const materialId = watch("materialId");
  const category = expenseTypeToCategory(expenseType);
  const isGajiTukang = category === "gaji_tukang";
  const isMaterial = category === "material";
  const isCash = expenseType === "gaji_tukang" || expenseType === "material_tunai" || expenseType === "lain_lain_tunai";
  const selectedMaterial = materials.find((m) => m.id === materialId);

  async function onSubmit(values: SubmitConstructionExpenseInput) {
    const result = await submitConstructionExpenseAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyimpan input");
      return;
    }
    toast.success(
      values.materialId && values.quantity
        ? `${TOAST_MESSAGE[values.expenseType]} -- stok ${selectedMaterial?.name ?? "material"} bertambah ${values.quantity} ${selectedMaterial?.unitSatuan ?? ""}`
        : TOAST_MESSAGE[values.expenseType],
    );
    reset({ projectId, expenseType, partyName: "", amount: undefined, description: "", expenseDate: today(), materialId: "", quantity: undefined });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <HardHat className="h-4 w-4" />
          Input Keuangan Proyek
        </CardTitle>
        <CardDescription>
          Catat gaji tukang, pembelian material, atau pembelian lain-lain (mis. notaris) -- pilih tunai (langsung potong dana proyek) atau utang (masuk
          daftar utang toko) untuk material/lain-lain. Super Admin menerima notifikasi setiap kali Anda menginput.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Controller
            control={control}
            name="expenseType"
            render={({ field }) => {
              function setCategory(next: Category) {
                field.onChange(CATEGORY_TO_EXPENSE_TYPE[next][isCash ? "cash" : "utang"]);
                if (next !== "material") {
                  setValue("materialId", "");
                  setValue("quantity", undefined);
                }
              }
              function setPayment(payment: "cash" | "utang") {
                field.onChange(CATEGORY_TO_EXPENSE_TYPE[category][payment]);
              }

              return (
                <>
                  <div className="space-y-1.5">
                    <Label>Jenis Pengeluaran</Label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setCategory("gaji_tukang")}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          category === "gaji_tukang" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <Users className="h-4 w-4" />
                        Gaji Tukang
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setCategory("material")}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          category === "material" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <ShoppingBag className="h-4 w-4" />
                        Material
                      </button>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => setCategory("lain_lain")}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                          category === "lain_lain" ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                        )}
                      >
                        <PackageOpen className="h-4 w-4" />
                        Lain-lain
                      </button>
                    </div>
                  </div>

                  {!isGajiTukang && (
                    <div className="space-y-1.5">
                      <Label>Pembayaran</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setPayment("cash")}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                            isCash ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                          )}
                        >
                          <Coins className="h-4 w-4" />
                          Tunai
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => setPayment("utang")}
                          className={cn(
                            "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                            !isCash ? "border-primary bg-primary/10 text-primary" : "border-input text-muted-foreground hover:bg-accent",
                          )}
                        >
                          <ShoppingBag className="h-4 w-4" />
                          Utang Toko
                        </button>
                      </div>
                    </div>
                  )}
                </>
              );
            }}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{isGajiTukang ? "Nama Tukang" : "Nama Toko/Pihak"}</Label>
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
            {!isGajiTukang &&
              (isCash ? (
                <p className="text-xs text-muted-foreground">Nominal ini langsung mengurangi dana tunai proyek, sama seperti gaji tukang.</p>
              ) : (
                <p className="text-xs text-muted-foreground">Nominal ini otomatis dicatat sebagai utang ke toko, bukan mengurangi dana tunai proyek.</p>
              ))}
          </div>

          {isMaterial && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Material (opsional)</Label>
                <Controller
                  control={control}
                  name="materialId"
                  render={({ field }) => (
                    <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isSubmitting}>
                      <SelectTrigger>
                        <SelectValue placeholder="Pilih material -- supaya stok otomatis tercatat" />
                      </SelectTrigger>
                      <SelectContent>
                        {materials.map((material) => (
                          <SelectItem key={material.id} value={material.id}>
                            {material.name} ({material.unitSatuan})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError message={errors.materialId?.message} />
              </div>
              <div className="space-y-1.5">
                <Label>Jumlah{selectedMaterial ? ` (${selectedMaterial.unitSatuan})` : ""}</Label>
                <Controller
                  control={control}
                  name="quantity"
                  render={({ field }) => (
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={selectedMaterial ? `contoh: 20 ${selectedMaterial.unitSatuan}` : "pilih material dulu"}
                      disabled={isSubmitting || !materialId}
                      value={field.value ?? ""}
                      onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
                    />
                  )}
                />
                <FieldError message={errors.quantity?.message} />
              </div>
              {materialId && (
                <p className="text-xs text-muted-foreground sm:col-span-2">
                  Stok {selectedMaterial?.name} di proyek ini akan otomatis bertambah begitu disimpan.
                </p>
              )}
            </div>
          )}

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
