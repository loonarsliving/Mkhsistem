"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, UserCheck, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { approveRegistrationAction, rejectRegistrationAction } from "../actions/registration.actions";
import { listPendingRegistrationsAction } from "../actions/registration-query.actions";

export function PendingRegistrationTable() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pending-registrations"], queryFn: listPendingRegistrationsAction });

  const [approveTarget, setApproveTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const items = data ?? [];

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["pending-registrations"] });
    void queryClient.invalidateQueries({ queryKey: ["pending-registration-count"] });
  }

  async function handleApprove() {
    if (!approveTarget) return;
    setPending(true);
    const result = await approveRegistrationAction(approveTarget.id);
    setPending(false);
    setApproveTarget(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menyetujui registrasi");
      return;
    }
    toast.success(`${approveTarget.name} disetujui dan dapat login sekarang`);
    invalidate();
  }

  async function handleReject() {
    if (!rejectTarget) return;
    setPending(true);
    const result = await rejectRegistrationAction(rejectTarget.id, rejectReason || undefined);
    setPending(false);
    setRejectTarget(null);
    setRejectReason("");
    if (!result.success) {
      toast.error(result.error ?? "Gagal menolak registrasi");
      return;
    }
    toast.success(`Registrasi ${rejectTarget.name} ditolak`);
    invalidate();
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {!isLoading && items.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="Tidak ada registrasi menunggu"
            description="Semua pendaftaran karyawan baru sudah diproses."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Nomor HP</TableHead>
                <TableHead>Cabang</TableHead>
                <TableHead>Divisi</TableHead>
                <TableHead>Tanggal Daftar</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.email}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.phone ?? "-"}</TableCell>
                  <TableCell>{(row.branches as { name: string } | null)?.name ?? "-"}</TableCell>
                  <TableCell>{(row.divisions as { name: string } | null)?.name ?? "-"}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(row.created_at).toLocaleString("id-ID")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setApproveTarget({ id: row.id, name: row.full_name })}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRejectTarget({ id: row.id, name: row.full_name })}
                      >
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title="Setujui pendaftaran?"
        description={`${approveTarget?.name} akan menjadi Staff dan langsung dapat login menggunakan email dan password yang didaftarkan.`}
        confirmLabel="Approve"
        loading={pending}
        onConfirm={handleApprove}
      />

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
        title="Tolak pendaftaran?"
        description={`${rejectTarget?.name} tidak akan bisa login. Anda dapat menambahkan alasan penolakan (opsional).`}
        confirmLabel="Reject"
        destructive
        loading={pending}
        onConfirm={handleReject}
      >
        <Textarea
          placeholder="Alasan penolakan (opsional)"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          rows={3}
        />
      </ConfirmDialog>
    </Card>
  );
}
