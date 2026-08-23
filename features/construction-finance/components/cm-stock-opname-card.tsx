"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardCheck, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { MaterialCatalogItem } from "@/repositories/cm-material.repository";
import type { StockOpnameRow } from "@/repositories/cm-warehouse.repository";

import { recordStockOpnameAction } from "../actions/cm-warehouse.actions";
import { recordStockOpnameSchema, type RecordStockOpnameInput } from "../schemas/construction-finance.schema";

interface CmStockOpnameCardProps {
  projectId: string;
  materials: MaterialCatalogItem[];
  opnames: StockOpnameRow[];
}

function RecordOpnameForm({ projectId, materials }: { projectId: string; materials: MaterialCatalogItem[] }) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RecordStockOpnameInput>({
    resolver: zodResolver(recordStockOpnameSchema),
    defaultValues: { projectId, materialId: "", countedQuantity: undefined, note: "" },
  });

  async function onSubmit(values: RecordStockOpnameInput) {
    const result = await recordStockOpnameAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat opname");
      return;
    }
    toast.success("Hasil opname dicatat");
    reset({ projectId, materialId: "", countedQuantity: undefined, note: "" });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-md border p-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Material</Label>
          <Controller
            control={control}
            name="materialId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isSubmitting}>
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
          {errors.materialId && <p className="text-sm text-destructive">{errors.materialId.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Hasil Hitung Fisik</Label>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={isSubmitting}
            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
            {...register("countedQuantity", { valueAsNumber: true })}
          />
          {errors.countedQuantity && <p className="text-sm text-destructive">{errors.countedQuantity.message}</p>}
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Catat Opname
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Catatan (opsional)</Label>
        <Textarea rows={2} disabled={isSubmitting} {...register("note")} />
      </div>
    </form>
  );
}

export function CmStockOpnameCard({ projectId, materials, opnames }: CmStockOpnameCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Opname Fisik Berkala
        </CardTitle>
        <CardDescription>
          Dicatat oleh yang di luar gudang & lapangan. Mencatat opname tidak otomatis mengubah stok sistem -- selisih perlu diinvestigasi dulu.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RecordOpnameForm projectId={projectId} materials={materials} />

        {opnames.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Sistem</TableHead>
                  <TableHead className="text-right">Hitung Fisik</TableHead>
                  <TableHead className="text-right">Selisih</TableHead>
                  <TableHead>Dihitung oleh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opnames.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.materialName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.systemQuantity} {row.unitSatuan}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.countedQuantity} {row.unitSatuan}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.variance === 0 ? (
                        <Badge variant="secondary">Cocok</Badge>
                      ) : (
                        <Badge variant="destructive">
                          {row.variance > 0 ? "+" : ""}
                          {row.variance}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{row.countedByName ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
