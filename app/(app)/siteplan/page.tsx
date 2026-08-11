import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { SiteplanViewerShell } from "@/features/siteplan/components/siteplan-viewer-shell";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listSiteplanProjects } from "@/repositories/loonars-siteplan.repository";

export const metadata: Metadata = { title: "Siteplan" };

export default async function SiteplanPage() {
  await requirePermission("siteplan.view");
  const supabase = await createClient();
  const projects = await listSiteplanProjects(supabase);

  return (
    <div className="space-y-6">
      <PageHeader title="Siteplan" description="Klik unit yang tersedia untuk mengajukan pembelian, atau lihat detail unit yang sudah diambil." />
      <SiteplanViewerShell projects={projects} />
    </div>
  );
}
