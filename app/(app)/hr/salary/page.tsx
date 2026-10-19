import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { History } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LPL_BRANCH_ID } from "@/constants/app";
import { PERMISSIONS } from "@/constants/rbac";
import { SalaryInputForm } from "@/features/salary-input/components/salary-input-form";
import { SalarySummarySendPanel } from "@/features/salary-input/components/salary-summary-send-panel";
import { SalaryTransferQueue } from "@/features/salary-input/components/salary-transfer-queue";
import { MONTH_LABELS } from "@/features/salary-input/schemas/salary-input.schema";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/utils";
import {
  listPendingSalaryTransfers,
  listSalaryCandidates,
  listSalarySubmissions,
  listUnsummarizedSalarySubmissions,
} from "@/repositories/salary-input.repository";

export const metadata: Metadata = { title: "Input Gaji Karyawan" };

export default async function SalaryInputPage() {
  const session = await requireSession();
  const canSubmit = hasPermission(session, PERMISSIONS.SALARY_INPUT_SUBMIT);
  const canTransfer = hasPermission(session, PERMISSIONS.SALARY_INPUT_TRANSFER);
  // Vando (Kepala Cabang Jogja) also inputs Loonars Private Living's salaries
  // -- submit_employee_salary accepts the LPL branch for him (0289).
  const canSubmitLpl =
    hasPermission(session, PERMISSIONS.LPL_STAFF_MANAGE) && session.employee.branch_id !== LPL_BRANCH_ID;

  if (!canSubmit && !canTransfer && !canSubmitLpl) redirect("/dashboard?error=forbidden");

  const supabase = await createClient();

  const [ownCandidates, lplCandidates, submissions, pendingTransfers, unsummarized, lplUnsummarized] = await Promise.all([
    canSubmit ? listSalaryCandidates(supabase, session.employee.branch_id) : Promise.resolve([]),
    canSubmitLpl ? listSalaryCandidates(supabase, LPL_BRANCH_ID) : Promise.resolve([]),
    listSalarySubmissions(supabase),
    canTransfer ? listPendingSalaryTransfers(supabase) : Promise.resolve([]),
    canSubmit ? listUnsummarizedSalarySubmissions(supabase, session.employee.branch_id) : Promise.resolve([]),
    canSubmitLpl ? listUnsummarizedSalarySubmissions(supabase, LPL_BRANCH_ID) : Promise.resolve([]),
  ]);
  const candidates = [...ownCandidates, ...lplCandidates];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Input Gaji Karyawan"
        description="Kepala Cabang input gaji dan nomor rekening karyawannya di sini. Slip gaji otomatis terkirim ke karyawan. Setelah SEMUA karyawan aktif di cabang sudah diinput, sistem otomatis mengirim satu ringkasan WhatsApp ke Super Admin — atau kirim manual kapan saja lewat tombol di bawah."
      />

      {canSubmit && (
        <SalarySummarySendPanel branchName={session.employee.branch_name ?? "-"} items={unsummarized} />
      )}

      {canSubmitLpl && (
        <SalarySummarySendPanel branchName="Loonars Private Living" branchId={LPL_BRANCH_ID} items={lplUnsummarized} />
      )}

      {(canSubmit || canSubmitLpl) && <SalaryInputForm candidates={candidates} />}

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
