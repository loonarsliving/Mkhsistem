"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, MapPin, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { SITEPLAN_PAYMENT_METHOD_LABEL, SITEPLAN_TRANSACTION_TYPE_LABEL, type SiteplanPaymentMethod, type SiteplanTransactionType } from "@/constants/app";
import { formatCurrency } from "@/lib/utils";

import { listPendingSiteplanPurchasesAction, rejectSiteplanPurchaseAction, verifySiteplanPurchaseAction } from "../actions/siteplan.actions";

export function UnitPurchaseQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["siteplan-pending-purchases"], queryFn: listPendingSiteplanPurchasesAction });
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["siteplan-pending-purchases"] });
  }

  async function handleVerify(id: string) {
    setBusyId(id);
    const result = await verifySiteplanPurchaseAction(id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memverifikasi pembelian");
      return;
    }
    toast.success("Pembelian terverifikasi — unit ditandai terjual & sales bisa ajukan fee");
    invalidate();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await rejectSiteplanPurchaseAction(rejectTarget, rejectReason || undefined);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak pembelian");
      return;
    }
    toast.success("Pembelian ditolak — unit kembali tersedia");
    setRejectTarget(null);
    setRejectReason("");
    invalidate();
  }

  const items = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pembelian Unit Siteplan</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {!isLoading && items.length === 0 ? (
          <EmptyState icon={MapPin} title="Tidak ada pembelian menunggu" description="Semua pengajuan pembelian unit siteplan sudah diverifikasi." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Pembeli</TableHead>
                  <TableHead>Marketing</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead>Metode</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="font-medium">
                        {p.loonars_units?.loonars_projects?.nama ?? "-"} — {p.loonars_units?.blok ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.buyer_name}
                      <p className="text-xs text-muted-foreground">{p.phone}</p>
                    </TableCell>
                    <TableCell>{p.marketing?.full_name ?? "-"}</TableCell>
                    <TableCell>{SITEPLAN_TRANSACTION_TYPE_LABEL[p.transaction_type as SiteplanTransactionType] ?? p.transaction_type}</TableCell>
                    <TableCell>{SITEPLAN_PAYMENT_METHOD_LABEL[p.payment_method as SiteplanPaymentMethod] ?? p.payment_method}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(p.price ?? 0)}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(p.transaction_date), "dd MMM yyyy", { locale: idLocale })}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => handleVerify(p.id)}>
                          <CheckCircle2 className="h-4 w-4" /> Verifikasi
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={busyId === p.id}
                          onClick={() => setRejectTarget(p.id)}
                        >
                          <XCircle className="h-4 w-4" /> Tolak
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        title="Tolak pembelian ini?"
        description="Unit akan kembali berstatus tersedia dan bisa diajukan ulang oleh marketing lain."
        confirmLabel="Tolak Pembelian"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Alasan penolakan (opsional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
      </ConfirmDialog>
    </Card>
  );
}
