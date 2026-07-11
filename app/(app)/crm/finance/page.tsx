import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { FinancePaymentQueue } from "@/features/crm/components/finance-payment-queue";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Verifikasi Pembayaran" };

export default async function CrmFinancePage() {
  await requirePermission("prospect.finance_verify");

  return (
    <div className="space-y-6">
      <PageHeader title="Verifikasi Pembayaran" description="Setujui atau tolak pembayaran yang tercatat dari Sales." />
      <FinancePaymentQueue />
    </div>
  );
}
