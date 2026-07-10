"use server";

import { revalidatePath } from "next/cache";

import { APP_URL } from "@/constants/app";
import { requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { insertEmployeeProfile, softDeleteEmployee, updateEmployee } from "@/repositories/employee.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { createEmployeeSchema, updateEmployeeSchema, type CreateEmployeeInput, type UpdateEmployeeInput } from "../schemas/employee.schema";

export async function createEmployeeAction(input: CreateEmployeeInput): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission("employee.manage");
  const parsed = createEmployeeSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const admin = createAdminClient();

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
    redirectTo: `${APP_URL}/reset-password`,
    data: { full_name: parsed.data.fullName },
  });

  if (inviteError || !invited.user) {
    return actionError(inviteError?.message ?? "Gagal membuat akun karyawan. Email mungkin sudah terdaftar.");
  }

  const supabase = await createClient();
  try {
    await insertEmployeeProfile(supabase, {
      id: invited.user.id,
      employee_code: parsed.data.employeeCode,
      full_name: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      branch_id: parsed.data.branchId,
      division_id: parsed.data.divisionId,
      position_id: parsed.data.positionId,
      role_id: parsed.data.roleId,
      gender: parsed.data.gender,
      birth_date: parsed.data.birthDate || null,
      join_date: parsed.data.joinDate,
      address: parsed.data.address || null,
      created_by: session.userId,
      updated_by: session.userId,
    });
  } catch (err) {
    // Roll back the orphaned auth account if the profile insert fails
    // (e.g. duplicate employee_code) so retrying with the same email works.
    await admin.auth.admin.deleteUser(invited.user.id);
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan data karyawan");
  }

  revalidatePath("/employees");
  return actionSuccess({ id: invited.user.id });
}

export async function updateEmployeeAction(input: UpdateEmployeeInput): Promise<ActionResult> {
  const session = await requirePermission("employee.manage");
  const parsed = updateEmployeeSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await updateEmployee(supabase, parsed.data.id, {
      employee_code: parsed.data.employeeCode,
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
      avatar_url: parsed.data.avatarUrl || null,
      branch_id: parsed.data.branchId,
      division_id: parsed.data.divisionId,
      position_id: parsed.data.positionId,
      role_id: parsed.data.roleId,
      employment_status: parsed.data.employmentStatus,
      gender: parsed.data.gender,
      birth_date: parsed.data.birthDate || null,
      join_date: parsed.data.joinDate,
      address: parsed.data.address || null,
      updated_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memperbarui data karyawan");
  }

  revalidatePath("/employees");
  revalidatePath(`/employees/${parsed.data.id}`);
  return actionSuccess();
}

export async function deactivateEmployeeAction(id: string): Promise<ActionResult> {
  await requirePermission("employee.manage");
  const supabase = await createClient();
  try {
    await softDeleteEmployee(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menonaktifkan karyawan");
  }
  revalidatePath("/employees");
  return actionSuccess();
}
