"use client";

import * as React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Gauge, Loader2 } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { MaterialCatalogItem } from "@/repositories/cm-material.repository";
import type { MaterialRequirementRow, PurchaseRequestItem } from "@/repositories/cm-procurement.repository";

import { decidePurchaseRequestAction, submitPurchaseRequestAction } from "../actions/cm-procurement.actions";
import { submitPurchaseRequestSchema, type SubmitPurchaseRequestInput } from "../schemas/cm-procurement.schema";

interface CmMaterialRequirementCardProps {
  projectId: string;
  requirement: MaterialRequirementRow[];
  pendingPr: PurchaseRequestItem[];
  materials: MaterialCatalogItem[];
  canSubmit: boolean;
  canApprove: boolean;
}

const STATUS_BADGE: Record<MaterialRequirementRow["status"], { label: string; variant: "outline" | "default" | "destructive" | "secondary" }> = {
  belum_perlu: { label: "Belum Perlu", variant: "outline" },
  shortage: { label: "Kurang", variant: "destructive" },
  normal: { label: "Normal", variant: "default" },
  overstock_risk: { label: "Risiko Lebih", variant: "secondary" },
  excessive: { label: "Berlebihan", variant: "destructive" },
};

function SubmitPrDialog({ projectId, materials }: { projectId: string; materials: MaterialCatalogItem[] }) {
  const [open, setOpen] = React.useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<SubmitPurchaseRequestInput>({
    resolver: zodResolver(submitPurchaseRequestSchema),
    defaultValues: { projectId, materialId: "", requestedQuantity: undefined, reason: "" },
  });

  async function onSubmit(values: SubmitPurchaseRequestInput) {
    const result = await submitPurchaseRequestAction(values);
    if (!result.success) {
      toast.error(result.error ?? "Gagal mengajukan permintaan");
      return;
    }
    toast.success("Permintaan pembelian diajukan");
    reset({ projectId, materialId: "", requestedQuantity: undefined, reason: "" });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Ajukan Permintaan Material
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajukan Permintaan Pembelian Material</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
                        {m.name} ({m.unitSatuan})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.materialId && <p className="text-sm text-destructive">{errors.materialId.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Jumlah Diminta</Label>
            <Input type="number" step="0.01" min="0" disabled={isSubmitting} {...register("requestedQuantity", { valueAsNumber: true })} />
            {errors.requestedQuantity && <p className="text-sm text-destructive">{errors.requestedQuantity.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Alasan (wajib jika jauh di atas saran sistem)</Label>
            <Textarea rows={2} disabled={isSubmitting} {...register("reason")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Ajukan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PendingPrRow({ pr }: { pr: PurchaseRequestItem }) {
  const [busy, setBusy] = React.useState(false);

  async function decide(approve: boolean) {
    setBusy(true);
    const reason = approve ? undefined : (window.prompt("Alasan penolakan?") ?? undefined);
    const result = await decidePurchaseRequestAction({ id: pr.id, approve, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memproses");
      return;
    }
    toast.success(approve ? "Permintaan disetujui" : "Permintaan ditolak");
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium">
          {pr.materialName} — {pr.requestedQuantity} {pr.unitSatuan}
        </p>
        <p className="text-xs text-muted-foreground">
          Saran sistem: {pr.suggestedQuantity ?? "-"} {pr.unitSatuan} · diajukan {pr.requestedByName ?? "-"}
        </p>
        {pr.reason && <p className="mt-1 text-xs">{pr.reason}</p>}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide(true)}>
          Setujui
        </Button>
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => decide(false)}>
          Tolak
        </Button>
      </div>
    </div>
  );
}

export function CmMaterialRequirementCard({ projectId, requirement, pendingPr, materials, canSubmit, canApprove }: CmMaterialRequirementCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="h-4 w-4" />
          Kebutuhan Material (BOQ x Progress)
        </CardTitle>
        <CardDescription>Dihitung otomatis: kuantitas BOQ x progress pekerjaan yang sudah disetujui, dibanding stok saat ini.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Pekerjaan</TableHead>
                <TableHead className="text-right">Dibutuhkan</TableHead>
                <TableHead className="text-right">Stok</TableHead>
                <TableHead className="text-right">Coverage</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requirement.map((row) => (
                <TableRow key={row.materialId}>
                  <TableCell>{row.materialName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.wbsName ?? "-"} ({row.wbsProgressPct}%)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.requiredQuantity} {row.unitSatuan}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.stockQuantity} {row.unitSatuan}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.coveragePct === null ? "-" : `${row.coveragePct}%`}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE[row.status].variant}>{STATUS_BADGE[row.status].label}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {canSubmit && <SubmitPrDialog projectId={projectId} materials={materials} />}

        {canApprove && pendingPr.length > 0 && (
          <div className="space-y-2 border-t pt-4">
            <p className="text-sm font-medium">Permintaan Pembelian Menunggu Approval ({pendingPr.length})</p>
            {pendingPr.map((pr) => (
              <PendingPrRow key={pr.id} pr={pr} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
