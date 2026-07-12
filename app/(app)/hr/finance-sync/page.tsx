import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { HrExpenseForm } from "@/features/hr-finance/components/hr-expense-form";
import { HrExpenseQueue } from "@/features/hr-finance/components/hr-expense-queue";
import { PayrollRunApprovePanel } from "@/features/hr-finance/components/payroll-run-approve-panel";
import { PayrollRunForm } from "@/features/hr-finance/components/payroll-run-form";
import { SyncLogTable } from "@/features/hr-finance/components/sync-log-table";
import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  listActiveEmployees,
  listBranches,
  listDraftPayrollRuns,
  listPendingHrExpenses,
  listRecentSyncLog,
} from "@/repositories/hr-finance.repository";

export const metadata: Metadata = { title: "Payroll & HR Expense — Sinkronisasi Finance" };

export default async function HrFinanceSyncPage() {
  await requireSession();
  const supabase = await createClient();

  const [pendingExpenses, draftRuns, employees, branches, syncLog] = await Promise.all([
    listPendingHrExpenses(supabase),
    listDraftPayrollRuns(supabase),
    listActiveEmployees(supabase),
    listBranches(supabase),
    listRecentSyncLog(supabase),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payroll & HR Expense"
        description="Setiap persetujuan di sini otomatis membuat transaksi pengeluaran yang sesuai di MKH Property — tidak perlu input ulang."
      />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Ajukan Bonus / Reimbursement / Beban HR Lain</h2>
        <HrExpenseForm employees={employees} branches={branches} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Menunggu Persetujuan</h2>
        <HrExpenseQueue items={pendingExpenses as never} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payroll Run Baru</h2>
        <PayrollRunForm branches={branches} />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Payroll Run — Draft (Setujui untuk Generate Gaji)</h2>
        {draftRuns.length ? (
          <div className="space-y-3">
            {draftRuns.map((run) => (
              <PayrollRunApprovePanel key={run.id} run={run as never} employees={employees as never} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Tidak ada payroll run draft.</p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Log Sinkronisasi ke MKH Property</h2>
        <SyncLogTable rows={syncLog as never} />
      </section>
    </div>
  );
}
