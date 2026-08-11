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
import { formatCurrency } from "@/lib/utils";

import { decideSiteplanFeeAction, listPendingSiteplanFeeRequestsAction } from "../actions/siteplan.actions";

export function SiteplanFeeQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["siteplan-pending-fee-requests"], queryFn: listPendingSiteplanFeeRequestsAction });
  const [rejectTarget, setRejectTarget] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["siteplan-pending-fee-requests"] });
  }

  async function handleApprove(id: string) {
    setBusyId(id);
    const result = await decideSiteplanFeeAction(id, true);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyetujui fee");
      return;
    }
    toast.success("Fee disetujui");
    invalidate();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setBusyId(rejectTarget);
    const result = await decideSiteplanFeeAction(rejectTarget, false, rejectReason || undefined);
    setBusyId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak fee");
      return;
    }
    toast.success("Fee ditolak");
    setRejectTarget(null);
    setRejectReason("");
    invalidate();
  }

  const items = data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pengajuan Fee Siteplan</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        {!isLoading && items.length === 0 ? (
          <EmptyState icon={MapPin} title="Tidak ada pengajuan fee" description="Belum ada pengajuan fee siteplan yang menunggu keputusan." />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Unit</TableHead>
                  <TableHead>Marketing</TableHead>
                  <TableHead className="text-right">Nominal Fee</TableHead>
                  <TableHead>Diajukan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <span className="font-medium">
                        {f.loonars_units?.loonars_projects?.nama ?? "-"} — {f.loonars_units?.blok ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell>{f.marketing?.full_name ?? "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(f.fee_amount)}</TableCell>
                    <TableCell className="whitespace-nowrap">{format(new Date(f.requested_at), "dd MMM yyyy", { locale: idLocale })}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={busyId === f.id} onClick={() => handleApprove(f.id)}>
                          <CheckCircle2 className="h-4 w-4" /> Setujui
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive"
                          disabled={busyId === f.id}
                          onClick={() => setRejectTarget(f.id)}
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
        title="Tolak pengajuan fee ini?"
        confirmLabel="Tolak Fee"
        destructive
        loading={busyId === rejectTarget}
        onConfirm={handleReject}
      >
        <Textarea placeholder="Alasan penolakan (opsional)" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
      </ConfirmDialog>
    </Card>
  );
}
