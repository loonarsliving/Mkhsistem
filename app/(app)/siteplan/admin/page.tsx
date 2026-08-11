import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SiteplanAdminPanel } from "@/features/siteplan/components/siteplan-admin-panel";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Kelola Siteplan" };

export default async function SiteplanAdminPage() {
  await requirePermission("siteplan.manage");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kelola Siteplan"
        description="Kelola project, unit, urutan baris grid siteplan, dan pengajuan fee."
      />
      <SiteplanAdminPanel />
    </div>
  );
}
