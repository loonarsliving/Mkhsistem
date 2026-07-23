import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { AssignChecklistForm } from "@/features/markom/components/assign-checklist-form";
import { hasPermission, requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Assign Task Markom" };

export default async function MarkomAssignPage() {
  const session = await requirePermission("kpi_task.assign");
  const canPickBranch = hasPermission(session, "kpi_task.view_all");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Assign Task Markom"
        description="Tugaskan checklist mingguan ke karyawan Markom. Karyawan tidak bisa menandai task-nya sendiri sebagai selesai."
      />
      <AssignChecklistForm canPickBranch={canPickBranch} defaultBranchId={session.employee.branch_id} />
    </div>
  );
}
