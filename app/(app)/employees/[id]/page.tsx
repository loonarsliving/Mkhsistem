import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PageHeader } from "@/components/shared/page-header";
import { DeactivateEmployeeButton } from "@/features/employees/components/deactivate-employee-button";
import { EmployeeEditForm } from "@/features/employees/components/employee-edit-form";
import { EmployeeReadonlyView } from "@/features/employees/components/employee-readonly-view";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getEmployeeById } from "@/repositories/employee.repository";
import type { UpdateEmployeeInput } from "@/features/employees/schemas/employee.schema";

export const metadata: Metadata = { title: "Detail Karyawan" };

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await createClient();

  const employee = await getEmployeeById(supabase, id).catch(() => null);
  if (!employee) notFound();

  const canManage = hasPermission(session, "employee.manage");

  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageHeader title={employee.full_name} description="Detail karyawan." />
        <EmployeeReadonlyView employee={employee} />
      </div>
    );
  }

  const formValues: UpdateEmployeeInput = {
    id: employee.id,
    employeeCode: employee.employee_code,
    fullName: employee.full_name,
    phone: employee.phone ?? "",
    branchId: employee.branch_id,
    divisionId: employee.division_id,
    positionId: employee.position_id,
    roleId: employee.role_id,
    employmentStatus: employee.employment_status,
    gender: employee.gender,
    birthDate: employee.birth_date ?? "",
    joinDate: employee.join_date,
    address: employee.address ?? "",
    avatarUrl: employee.avatar_url ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={employee.full_name}
        description={employee.is_root_owner ? "Root Owner — akun ini tidak dapat dinonaktifkan atau dihapus." : "Kelola data karyawan."}
        actions={
          employee.employment_status !== "terminated" &&
          !employee.is_root_owner && <DeactivateEmployeeButton employeeId={employee.id} />
        }
      />
      <EmployeeEditForm initialValues={formValues} />
    </div>
  );
}
