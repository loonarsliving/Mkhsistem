"use server";

import { revalidatePath } from "next/cache";

import { logger } from "@/lib/logger";
import { requireSession } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { registerSchema, type RegisterInput } from "../schemas/registration.schema";

/**
 * Self-registration. Runs entirely through the service-role client — there
 * is no session yet, and RLS blocks anon writes to employees/auth tables by
 * design. The new account is created with role "pending" and
 * is_active=false, so `loginAction` rejects sign-in until an authorized
 * approver acts on it.
 */
export async function registerAction(input: RegisterInput): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  }
  const { fullName, email, phone, password, branchId, divisionId } = parsed.data;

  const admin = createAdminClient();

  const { data: pendingRole } = await admin.from("roles").select("id").eq("key", "pending").single();
  if (!pendingRole) {
    logger.error("Registration failed: 'pending' role not seeded");
    return actionError("Pendaftaran sedang tidak tersedia. Silakan coba lagi nanti.");
  }

  const { data: created, error: createUserError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (createUserError || !created.user) {
    if (createUserError?.message.toLowerCase().includes("already been registered")) {
      return actionError("Email sudah terdaftar", { email: ["Email ini sudah digunakan"] });
    }
    logger.error("Registration failed to create auth user", { error: createUserError?.message });
    return actionError("Gagal membuat akun. Silakan coba lagi.");
  }

  const { error: profileError } = await admin.from("employees").insert({
    id: created.user.id,
    full_name: fullName,
    email,
    phone,
    branch_id: branchId,
    division_id: divisionId,
    role_id: pendingRole.id,
    approval_status: "pending",
    is_active: false,
  });

  if (profileError) {
    // Roll back the orphaned auth user so a retry with the same email works.
    await admin.auth.admin.deleteUser(created.user.id);
    logger.error("Registration failed to create employee profile", { error: profileError.message });
    return actionError("Gagal menyimpan data pendaftaran. Silakan coba lagi.");
  }

  await notifyApprovers(admin, branchId, fullName);

  return actionSuccess();
}

/**
 * Notifies whoever is authorized to approve this registration: the branch's
 * Kepala Cabang if one exists, otherwise every Direktur Operasional (covers
 * Jabodetabek/Kendari, which have no branch head yet) — plus every Super
 * Admin, always, regardless of branch.
 */
async function notifyApprovers(admin: ReturnType<typeof createAdminClient>, branchId: string, registrantName: string) {
  const { data: approvers } = await admin
    .from("employees")
    .select("id, branch_id, roles:role_id(key)")
    .in("role_id", await roleIdsFor(admin, ["super_admin", "direktur_operasional", "kepala_cabang"]))
    .eq("approval_status", "approved")
    .is("deleted_at", null);

  const hasOwnKepalaCabang = (approvers ?? []).some(
    (e) => e.branch_id === branchId && (e.roles as { key: string } | null)?.key === "kepala_cabang",
  );

  const recipientIds = (approvers ?? [])
    .filter((e) => {
      const roleKey = (e.roles as { key: string } | null)?.key;
      if (roleKey === "super_admin") return true;
      if (roleKey === "kepala_cabang") return e.branch_id === branchId;
      if (roleKey === "direktur_operasional") return !hasOwnKepalaCabang;
      return false;
    })
    .map((e) => e.id);

  if (recipientIds.length === 0) return;

  const rows = recipientIds.map((userId) => ({
    user_id: userId,
    type: "registration" as const,
    title: "Pendaftaran karyawan baru",
    body: `${registrantName} mendaftar dan menunggu persetujuan Anda.`,
    link: "/registrations",
  }));

  const { error } = await admin.from("mkc_notifications").insert(rows);
  if (error) logger.error("Failed to notify registration approvers", { error: error.message });
}

async function roleIdsFor(admin: ReturnType<typeof createAdminClient>, keys: string[]) {
  const { data } = await admin.from("roles").select("id").in("key", keys);
  return (data ?? []).map((r) => r.id);
}

export async function approveRegistrationAction(employeeId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_employee_registration", { p_employee_id: employeeId });
  if (error) return actionError(error.message);
  revalidatePath("/registrations");
  revalidatePath("/dashboard");
  return actionSuccess();
}

export async function rejectRegistrationAction(employeeId: string, reason?: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_employee_registration", {
    p_employee_id: employeeId,
    p_reason: reason ?? null,
  });
  if (error) return actionError(error.message);
  revalidatePath("/registrations");
  revalidatePath("/dashboard");
  return actionSuccess();
}
