import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { TargetManagementForm } from "@/features/crm/components/target-management-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Target Sales" };

export default async function CrmTargetsPage() {
  await requirePermission("sales_target.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Target Sales"
        description="Atur target unit, harga jual, dan komisi per produk untuk setiap cabang — sistem otomatis mendistribusikan ke Sales yang ditugaskan pada masing-masing produk."
      />
      <TargetManagementForm />
    </div>
  );
}
