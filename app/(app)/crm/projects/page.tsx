import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { ProjectTable } from "@/features/crm/components/project-table";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listCrmProjectsAdmin } from "@/repositories/crm.repository";

export const metadata: Metadata = { title: "Project Master" };

export default async function CrmProjectsPage() {
  await requirePermission("crm_project.manage");
  const supabase = await createClient();
  const projects = await listCrmProjectsAdmin(supabase);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Master"
        description="Kelola daftar project properti — referensi utama untuk CRM, Sales, Finance, HR, Project Management, dan modul lainnya."
      />
      <ProjectTable projects={projects} />
    </div>
  );
}
