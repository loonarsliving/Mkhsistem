"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip, UserCog, Warehouse, X } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { STORAGE_BUCKETS } from "@/constants/app";
import { uploadEntityFile } from "@/lib/supabase/storage";
import type { ProjectWbsOption } from "@/repositories/cm-labor.repository";
import type { MaterialCatalogItem } from "@/repositories/cm-material.repository";
import type { BranchEmployeeOption, MaterialConsumptionRow, WarehouseKeeper } from "@/repositories/cm-warehouse.repository";

import { assignWarehouseKeeperAction, consumeMaterialAction } from "../actions/cm-warehouse.actions";
import { consumeMaterialSchema, type ConsumeMaterialInput } from "../schemas/construction-finance.schema";

interface CmWarehouseKeeperCardProps {
  projectId: string;
  keeper: WarehouseKeeper | null;
  employeeOptions: BranchEmployeeOption[];
  materials: MaterialCatalogItem[];
  wbsOptions: ProjectWbsOption[];
  consumption: MaterialConsumptionRow[];
  /** construction_finance.manage -- can (re)assign the keeper. */
  canManage: boolean;
  /** true when the signed-in employee is this project's active keeper, or canManage. */
  canRecordConsumption: boolean;
}

function AssignKeeperForm({ projectId, employeeOptions }: { projectId: string; employeeOptions: BranchEmployeeOption[] }) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function assign() {
    if (!employeeId) return;
    setBusy(true);
    const result = await assignWarehouseKeeperAction({ projectId, employeeId });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menunjuk Petugas Gudang");
      return;
    }
    toast.success("Petugas Gudang ditunjuk");
    setEmployeeId("");
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-1.5">
        <Label>Tunjuk Petugas Gudang</Label>
        <Select value={employeeId} onValueChange={setEmployeeId} disabled={busy}>
          <SelectTrigger>
            <SelectValue placeholder="Pilih karyawan -- bukan pengawas lapangan yang sama" />
          </SelectTrigger>
          <SelectContent>
            {employeeOptions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.fullName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" disabled={busy || !employeeId} onClick={assign}>
        {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Tunjuk
      </Button>
    </div>
  );
}

function ConsumeMaterialForm({ projectId, materials, wbsOptions }: { projectId: string; materials: MaterialCatalogItem[]; wbsOptions: ProjectWbsOption[] }) {
  const [uploading, setUploading] = React.useState(false);
  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ConsumeMaterialInput>({
    resolver: zodResolver(consumeMaterialSchema),
    defaultValues: { projectId, materialId: "", quantity: undefined, photoUrl: "", projectWbsId: "", note: "" },
  });
  const photoUrl = watch("photoUrl");

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { publicUrl } = await uploadEntityFile(STORAGE_BUCKETS.PROJECT_PHOTOS, projectId, file);
      setValue("photoUrl", publicUrl ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal mengunggah foto");
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: ConsumeMaterialInput) {
    const result = await consumeMaterialAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mencatat barang keluar");
      return;
    }
    toast.success("Barang keluar dicatat, stok diperbarui");
    reset({ projectId, materialId: "", quantity: undefined, photoUrl: "", projectWbsId: "", note: "" });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-md border p-3" noValidate>
      <p className="text-sm font-medium">Serah Terima ke Pekerja</p>
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
          <Label>Jumlah</Label>
          <input
            type="number"
            min="0"
            step="0.01"
            disabled={isSubmitting}
            className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm"
            {...register("quantity", { valueAsNumber: true })}
          />
          {errors.quantity && <p className="text-sm text-destructive">{errors.quantity.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Untuk Pekerjaan (opsional)</Label>
          <Controller
            control={control}
            name="projectWbsId"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange} disabled={isSubmitting}>
                <SelectTrigger>
                  <SelectValue placeholder="Tidak ditentukan" />
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
      </div>
      <div className="space-y-1.5">
        <Label>Foto Bukti (wajib)</Label>
        {photoUrl ? (
          <div className="flex items-center gap-2">
            <a href={photoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
              Lihat foto
            </a>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setValue("photoUrl", "")}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={uploading} asChild>
            <label>
              {uploading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Paperclip className="mr-1 h-4 w-4" />}
              Ambil/Pilih Foto
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => handlePhoto(e.target.files?.[0])} />
            </label>
          </Button>
        )}
        {errors.photoUrl && <p className="text-sm text-destructive">{errors.photoUrl.message}</p>}
      </div>
      <div className="space-y-1.5">
        <Label>Catatan (opsional)</Label>
        <Textarea rows={2} disabled={isSubmitting} {...register("note")} />
      </div>
      <Button type="submit" disabled={isSubmitting || uploading}>
        {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
        Catat Barang Keluar
      </Button>
    </form>
  );
}

export function CmWarehouseKeeperCard({
  projectId,
  keeper,
  employeeOptions,
  materials,
  wbsOptions,
  consumption,
  canManage,
  canRecordConsumption,
}: CmWarehouseKeeperCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Warehouse className="h-4 w-4" />
          Petugas Gudang
        </CardTitle>
        <CardDescription>Satu orang, terpisah dari pengawas lapangan, yang mencatat barang keluar dari gudang.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2">
          <UserCog className="h-4 w-4 text-muted-foreground" />
          {keeper ? (
            <Badge variant="secondary">{keeper.employeeName}</Badge>
          ) : (
            <span className="text-sm text-muted-foreground">Belum ditunjuk</span>
          )}
        </div>

        {canManage && <AssignKeeperForm projectId={projectId} employeeOptions={employeeOptions} />}

        {canRecordConsumption && <ConsumeMaterialForm projectId={projectId} materials={materials} wbsOptions={wbsOptions} />}

        {consumption.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Material</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Untuk</TableHead>
                  <TableHead>Dicatat oleh</TableHead>
                  <TableHead>Bukti</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {consumption.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.materialName}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity} {row.unitSatuan}
                    </TableCell>
                    <TableCell>{row.wbsName ?? "-"}</TableCell>
                    <TableCell>{row.recordedByName ?? "-"}</TableCell>
                    <TableCell>
                      <a href={row.photoUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                        Lihat
                      </a>
                    </TableCell>
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
