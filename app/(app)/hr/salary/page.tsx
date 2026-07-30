import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PERMISSIONS } from "@/constants/rbac";
import { SalaryInputForm } from "@/features/salary-input/components/salary-input-form";
import { SalaryTransferQueue } from "@/features/salary-input/components/salary-transfer-queue";
import { MONTH_LABELS } from "@/features/salary-input/schemas/salary-input.schema";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import { listPendingSalaryTransfers, listSalaryCandidates, listSalarySubmissions } from "@/repositories/salary-input.repository";

export const metadata: Metadata = { title: "Input Gaji Karyawan" };

export default async function SalaryInputPage() {
  const session = await requireSession();
  const canSubmit = hasPermission(session, PERMISSIONS.SALARY_INPUT_SUBMIT);
  const canTransfer = hasPermission(session, PERMISSIONS.SALARY_INPUT_TRANSFER);

  if (!canSubmit && !canTransfer) redirect("/dashboard?error=forbidden");

  const supabase = await createClient();

  const [candidates, submissions, pendingTransfers] = await Promise.all([
    canSubmit ? listSalaryCandidates(supabase, session.employee.branch_id) : Promise.resolve([]),
    listSalarySubmissions(supabase),
    canTransfer ? listPendingSalaryTransfers(supabase) : Promise.resolve([]),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Input Gaji Karyawan"
        description="Kepala Cabang input gaji dan nomor rekening karyawannya di sini. Slip gaji otomatis terkirim ke karyawan, dan Super Admin mendapat notifikasi untuk mentransfer."
      />

      {canSubmit && <SalaryInputForm candidates={candidates} />}

      {canTransfer && <SalaryTransferQueue items={pendingTransfers} />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" />
            Riwayat
          </CardTitle>
          <CardDescription>Daftar gaji yang pernah diinput, baik yang masih menunggu transfer maupun yang sudah selesai.</CardDescription>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <EmptyState icon={History} title="Belum ada riwayat" description="Belum ada gaji yang diinput." className="py-8" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Karyawan</TableHead>
                    <TableHead>Cabang</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.employeeName}</TableCell>
                      <TableCell>{item.branchName ?? "-"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {MONTH_LABELS[item.periodMonth - 1]} {item.periodYear}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatCurrency(item.amount)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "transferred" ? "default" : "outline"}>
                          {item.status === "transferred" ? "Sudah Ditransfer" : "Menunggu Transfer"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
