"use server";

import { revalidatePath } from "next/cache";

import { APP_URL } from "@/constants/app";
import { PERMISSIONS } from "@/constants/rbac";
import { requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { addLplEmployeeSchema, type AddLplEmployeeInput } from "../schemas/lpl-staff.schema";

/**
 * Same invite flow as createEmployeeAction, but the profile is written by
 * lpl_add_employee (0289) under the caller's own session -- the RPC forces
 * branch LPL, an LPL division and the staff role, so this page can't be
 * used to place someone elsewhere or hand out a higher role.
 */
export async function addLplEmployeeAction(input: AddLplEmployeeInput): Promise<ActionResult<{ employeeCode: string }>> {
  await requirePermission(PERMISSIONS.LPL_STAFF_MANAGE);
  const parsed = addLplEmployeeSchema.safeParse(input);
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
  const { data, error } = await supabase.rpc("lpl_add_employee", {
    p_id: invited.user.id,
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone || null,
    p_division_id: parsed.data.divisionId,
    p_gender: parsed.data.gender,
    p_join_date: parsed.data.joinDate,
    p_bank_name: parsed.data.bankName || null,
    p_bank_account_number: parsed.data.bankAccountNumber || null,
    p_bank_account_holder: parsed.data.bankAccountHolder || null,
  });
  if (error) {
    // Roll back the orphaned auth account so retrying with the same email works.
    await admin.auth.admin.deleteUser(invited.user.id);
    return actionError(error.message);
  }

  revalidatePath("/lpl-staff");
  revalidatePath("/hr/salary");
  return actionSuccess({ employeeCode: data as string });
}

export async function removeLplEmployeeAction(id: string): Promise<ActionResult> {
  await requirePermission(PERMISSIONS.LPL_STAFF_MANAGE);
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return actionError("Data tidak valid");

  const supabase = await createClient();
  const { error } = await supabase.rpc("lpl_remove_employee", { p_id: id });
  if (error) return actionError(error.message);

  revalidatePath("/lpl-staff");
  revalidatePath("/hr/salary");
  return actionSuccess();
}
