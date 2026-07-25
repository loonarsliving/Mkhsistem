"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { CheckCircle2, Home, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency } from "@/lib/utils";

import {
  listPendingLoonarsClosingsAction,
  rejectLoonarsClosingAction,
  verifyLoonarsClosingAction,
} from "../actions/loonars-closing.actions";

const TIPE_LABEL: Record<string, string> = { booking: "Booking Fee", dp: "Down Payment", akad: "Akad/Lunas" };

export function LoonarsClosingQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["loonars-pending-closings"], queryFn: listPendingLoonarsClosingsAction });
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function handleVerify(id: string) {
    setBusyId(id);
    const result = await verifyLoonarsClosingAction(id);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal memverifikasi closing");
      return;
    }
    toast.success("Closing terverifikasi — unit ditandai terjual & sales bisa ajukan fee");
    queryClient.invalidateQueries({ queryKey: ["loonars-pending-closings"] });
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await rejectLoonarsClosingAction(rejectTarget, rejectReason || undefined);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak closing");
      return;
    }
    toast.success("Closing ditolak — unit kembali tersedia");
    setRejectTarget(null);
    setRejectReason("");
    queryClient.invalidateQueries({ queryKey: ["loonars-pending-closings"] });
  }

  const items = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Closing Loonars Villa</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {!isLoading && items.length === 0 ? (
          <EmptyState icon={Home} title="Tidak ada closing menunggu" description="Semua closing Loonars Villa sudah diverifikasi." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Pembeli</TableHead>
                  <TableHead>Marketing</TableHead>
                  <TableHead>Jenis</TableHead>
                  <TableHead className="text-right">Nilai</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="font-medium">{c.proyek} — {c.blok}</span>
                    </TableCell>
                    <TableCell>
                      {c.buyer ?? "-"}
                      <p className="text-xs text-muted-foreground">{c.phone}</p>
                    </TableCell>
                    <TableCell>
                      {c.marketing_name ?? "-"}
                      {!c.matched_employee_id && <p className="text-xs text-destructive">Tidak cocok dengan karyawan aktif</p>}
                    </TableCell>
                    <TableCell>{c.tipe ? (TIPE_LABEL[c.tipe] ?? c.tipe) : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(c.price ?? 0)}</TableCell>
                    <TableCell className="whitespace-nowrap">{c.tgl ? format(new Date(c.tgl), "dd MMM yyyy", { locale: idLocale }) : "-"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleVerify(c.id)}>
                          <CheckCircle2 className="h-4 w-4" /> Verifikasi
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={busyId === c.id}
                          onClick={() => setRejectTarget(c.id)}
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
        title="Tolak closing ini?"
        description="Unit akan kembali berstatus tersedia di loonars-sales dan data pembeli dihapus."
        confirmLabel="Tolak Closing"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Alasan penolakan (opsional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
      </ConfirmDialog>
    </Card>
  );
}
