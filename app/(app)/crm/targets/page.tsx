import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SalesTargetForm } from "@/features/crm/components/sales-target-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Target Sales" };

export default async function CrmTargetsPage() {
  await requirePermission("sales_target.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Target Sales" description="Atur target unit dan persentase komisi bulanan untuk setiap Sales." />
      <SalesTargetForm />
    </div>
  );
}
