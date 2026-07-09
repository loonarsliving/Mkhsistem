import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";
import { EmployeeCreateForm } from "@/features/employees/components/employee-create-form";
import { requirePermission } from "@/lib/rbac/session";

export const metadata: Metadata = { title: "Tambah Karyawan" };

export default async function NewEmployeePage() {
  await requirePermission("employee.manage");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Tambah Karyawan" description="Buat akun dan data karyawan baru. Undangan akan dikirim melalui email." />
      <EmployeeCreateForm />
    </div>
  );
}
