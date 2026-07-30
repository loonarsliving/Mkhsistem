"use client";

import { useState } from "react";
import { Landmark } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { SalarySubmission } from "@/repositories/salary-input.repository";

import { markSalaryTransferredAction } from "../actions/salary-input.actions";
import { MONTH_LABELS } from "../schemas/salary-input.schema";

export function SalaryTransferQueue({ items }: { items: SalarySubmission[] }) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleTransfer(id: string) {
    setPendingId(id);
    const result = await markSalaryTransferredAction({ id });
    setPendingId(null);
    if (!result.success) {
      toast.error(result.error ?? "Gagal menandai transfer");
      return;
    }
    toast.success("Ditandai sudah ditransfer, karyawan menerima notifikasi");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Landmark className="h-4 w-4" />
          Menunggu Transfer
        </CardTitle>
        <CardDescription>Gaji yang sudah diinput Kepala Cabang dan menunggu ditransfer ke rekening karyawan.</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState icon={Landmark} title="Tidak ada yang menunggu" description="Semua permintaan transfer gaji sudah diproses." className="py-8" />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Karyawan</TableHead>
                  <TableHead>Cabang</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Rekening</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.employeeName}</TableCell>
                    <TableCell>{item.branchName ?? "-"}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {MONTH_LABELS[item.periodMonth - 1]} {item.periodYear}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(item.amount)}</TableCell>
                    <TableCell>
                      <div>{item.bankName ?? "-"} {item.bankAccountNumber}</div>
                      {item.bankAccountHolder && <p className="text-xs text-muted-foreground">a.n. {item.bankAccountHolder}</p>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={pendingId === item.id} onClick={() => handleTransfer(item.id)}>
                        Tandai Sudah Transfer
                      </Button>
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
