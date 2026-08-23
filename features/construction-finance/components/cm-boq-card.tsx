"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardList, Loader2, Trash2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { ProjectBoqLine } from "@/repositories/cm-boq.repository";
import type { ProjectWbsOption } from "@/repositories/cm-labor.repository";
import type { MaterialCatalogItem } from "@/repositories/cm-material.repository";

import { addBoqLineAction, deleteBoqLineAction } from "../actions/construction-finance.actions";
import { addBoqLineSchema, type AddBoqLineInput } from "../schemas/construction-finance.schema";

interface CmBoqCardProps {
  projectId: string;
  lines: ProjectBoqLine[];
  materials: MaterialCatalogItem[];
  wbsOptions: ProjectWbsOption[];
}

const CATEGORY_LABEL: Record<AddBoqLineInput["category"], string> = {
  material: "Material",
  labor: "Tenaga Kerja",
  equipment: "Peralatan",
  other: "Lain-lain",
};

// Gaji tukang selalu borongan (dibayar mingguan sesuai bobot pekerjaan x
// progress), tidak pernah angka tetap seperti baris BOQ lain -- jadi
// "Tenaga Kerja" sengaja tidak bisa dipilih di sini, itu diatur lewat
// kartu Kontrak Borongan di bawah, bukan diketik manual di BOQ.
const ADDABLE_CATEGORIES = (["material", "equipment", "other"] as const) satisfies readonly AddBoqLineInput["category"][];

function AddBoqLineForm({ projectId, materials, wbsOptions }: { projectId: string; materials: MaterialCatalogItem[]; wbsOptions: ProjectWbsOption[] }) {
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<AddBoqLineInput>({
    resolver: zodResolver(addBoqLineSchema),
    defaultValues: { projectId, category: "material", materialId: "", description: "", quantity: undefined, unit: "", unitPrice: undefined, projectWbsId: "" },
  });
  const category = watch("category");

  async function onSubmit(values: AddBoqLineInput) {
    const result = await addBoqLineAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menambah baris BOQ");
      return;
    }
    toast.success("Baris BOQ ditambahkan");
    reset({ projectId, category: values.category, materialId: "", description: "", quantity: undefined, unit: "", unitPrice: undefined, projectWbsId: "" });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-md border p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label>Kategori</Label>
          <Controller
            control={control}
            name="category"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  if (v !== "material") setValue("materialId", "");
                }}
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ADDABLE_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {CATEGORY_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>

        {category === "material" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Material</Label>
            <Controller
              control={control}
              name="materialId"
              render={({ field }) => (
                <Select
                  value={field.value || undefined}
                  onValueChange={(v) => {
                    field.onChange(v);
                    const m = materials.find((mm) => mm.id === v);
                    if (m) {
                      setValue("description", m.name);
                      setValue("unit", m.unitSatuan);
                      if (m.standardPrice !== null) setValue("unitPrice", m.standardPrice);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih material" />
                  </SelectTrigger>
                  <SelectContent>
                    {materials.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        ) : (
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Deskripsi</Label>
            <Input placeholder="contoh: Upah tukang batu" disabled={isSubmitting} {...register("description")} />
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Satuan</Label>
          <Input placeholder="zak / kg / m3 / hari" disabled={isSubmitting} {...register("unit")} />
        </div>
      </div>

      {category === "material" && wbsOptions.length > 0 && (
        <div className="space-y-1.5">
          <Label>Untuk Pekerjaan (WBS) -- opsional, tapi mengaktifkan cek kebutuhan material</Label>
          <Controller
            control={control}
            name="projectWbsId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Tidak ditautkan" />
                </SelectTrigger>
                <SelectContent>
                  {wbsOptions.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Quantity</Label>
          <Input type="number" min="0" step="0.01" disabled={isSubmitting} {...register("quantity", { valueAsNumber: true })} />
          {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Harga Satuan</Label>
          <Controller
            control={control}
            name="unitPrice"
            render={({ field }) => <CurrencyInput value={field.value} onValueChange={field.onChange} disabled={isSubmitting} />}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Tambah ke BOQ
          </Button>
        </div>
      </div>
      {errors.description && <p className="text-sm text-destructive">{errors.description.message}</p>}
      {errors.unit && <p className="text-sm text-destructive">{errors.unit.message}</p>}
    </form>
  );
}

function BoqLineRow({ line }: { line: ProjectBoqLine }) {
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!window.confirm(`Hapus baris "${line.description}" dari BOQ?`)) return;
    setBusy(true);
    const result = await deleteBoqLineAction({ id: line.id });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menghapus");
      return;
    }
    toast.success("Baris BOQ dihapus");
  }

  return (
    <TableRow>
      <TableCell>{CATEGORY_LABEL[line.category]}</TableCell>
      <TableCell>{line.description}</TableCell>
      <TableCell className="text-muted-foreground">{line.wbsName ?? "-"}</TableCell>
      <TableCell className="text-right tabular-nums">
        {line.quantity} {line.unit}
      </TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(line.unitPrice)}</TableCell>
      <TableCell className="text-right tabular-nums font-medium">{formatCurrency(line.budget)}</TableCell>
      <TableCell>
        <Button size="icon" variant="ghost" className="h-7 w-7" disabled={busy} onClick={remove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

export function CmBoqCard({ projectId, lines, materials, wbsOptions }: CmBoqCardProps) {
  const totalBudget = lines.reduce((sum, l) => sum + l.budget, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardList className="h-4 w-4" />
          BOQ Proyek (Bill of Quantity)
        </CardTitle>
        <CardDescription>Dasar perhitungan kebutuhan material dan cost control -- isi item per item sesuai kondisi proyek ini.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Gaji tukang tidak diisi di sini -- selalu borongan, dibayar mingguan sesuai bobot pekerjaan x progress lewat kartu &quot;Kontrak Borongan /
          Kontraktor&quot; di bawah.
        </p>
        <AddBoqLineForm projectId={projectId} materials={materials} wbsOptions={wbsOptions} />

        {lines.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Kategori</TableHead>
                  <TableHead>Deskripsi</TableHead>
                  <TableHead>WBS</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Harga Satuan</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <BoqLineRow key={line.id} line={line} />
                ))}
              </TableBody>
            </Table>
            <p className="mt-2 text-right text-sm font-medium">Total BOQ: {formatCurrency(totalBudget)}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
