"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, ReceiptText, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PAYMENT_TYPE_LABEL } from "@/constants/app";
import { formatCurrency } from "@/lib/utils";

import { approvePaymentAction, rejectPaymentAction } from "../actions/crm.actions";
import { listPendingPaymentsAction } from "../actions/crm-query.actions";

export function FinancePaymentQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["crm-pending-payments"], queryFn: listPendingPaymentsAction });
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function handleApprove(paymentId: string) {
    setBusyId(paymentId);
    const result = await approvePaymentAction(paymentId);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyetujui pembayaran");
      return;
    }
    toast.success("Pembayaran disetujui");
    queryClient.invalidateQueries({ queryKey: ["crm-pending-payments"] });
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await rejectPaymentAction({ paymentId: rejectTarget, reason: rejectReason || undefined });
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak pembayaran");
      return;
    }
    toast.success("Pembayaran ditolak");
    setRejectTarget(null);
    setRejectReason("");
    queryClient.invalidateQueries({ queryKey: ["crm-pending-payments"] });
  }

  const items = data ?? [];

  return (
    <Card>
      <CardContent className="p-4">
        {!isLoading && items.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Tidak ada pembayaran menunggu" description="Semua pembayaran sudah diverifikasi." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Sales</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Jumlah</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <Link href={`/crm/${p.prospect_id}`} className="hover:underline">
                        {p.prospect?.customer_name ?? "-"}
                      </Link>
                      <p className="text-xs text-muted-foreground">{p.prospect?.project?.name}</p>
                    </TableCell>
                    <TableCell>{p.prospect?.sales?.full_name ?? "-"}</TableCell>
                    <TableCell>{PAYMENT_TYPE_LABEL[p.payment_type]}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(p.amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(p.payment_date), "dd MMM yyyy", { locale: idLocale })}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === p.id} onClick={() => handleApprove(p.id)}>
                          <CheckCircle2 className="h-4 w-4" /> Setujui
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
        title="Tolak pembayaran ini?"
        description="Sales dan pelanggan tidak akan mendapatkan Closing dari pembayaran ini."
        confirmLabel="Tolak Pembayaran"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Alasan penolakan (opsional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
      </ConfirmDialog>
    </Card>
  );
}
