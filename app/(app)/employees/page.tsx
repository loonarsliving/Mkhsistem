import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { EmployeeTable } from "@/features/employees/components/employee-table";
import { hasPermission, requireSession } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Karyawan" };

export default async function EmployeesPage() {
  const session = await requireSession();
  if (!hasPermission(session, "employee.view_branch") && !hasPermission(session, "employee.view_all")) {
    redirect("/dashboard?error=forbidden");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Karyawan" description="Data seluruh karyawan perusahaan." />
      <EmployeeTable
        canCreate={hasPermission(session, "employee.manage")}
        canViewAllBranches={hasPermission(session, "employee.view_all")}
      />
    </div>
  );
}
