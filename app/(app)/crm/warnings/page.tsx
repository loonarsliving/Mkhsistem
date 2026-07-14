import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { Sp1WarningList } from "@/features/crm/components/sp1-warning-list";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "SP1 Sales" };

export default async function Sp1WarningsPage() {
  await requirePermission("sp1_warning.manage");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="SP1 Sales"
        description="Draft Surat Peringatan 1 yang dibuat AI setiap 3 hari untuk sales tanpa closing dan prospek yang stuck -- review dan setujui/tolak di sini."
      />
      <Sp1WarningList />
    </div>
  );
}
