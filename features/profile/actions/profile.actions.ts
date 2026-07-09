"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { updateEmployee } from "@/repositories/employee.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { changePasswordSchema, updateProfileSchema, type ChangePasswordInput, type UpdateProfileInput } from "../schemas/profile.schema";

export async function updateProfileAction(input: UpdateProfileInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await updateEmployee(supabase, session.userId, {
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
      address: parsed.data.address || null,
      avatar_url: parsed.data.avatarUrl || null,
      updated_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memperbarui profil");
  }

  revalidatePath("/profile");
  revalidatePath("/dashboard");
  return actionSuccess();
}

export async function changePasswordAction(input: ChangePasswordInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email: session.employee.email,
    password: parsed.data.currentPassword,
  });
  if (verifyError) return actionError("Password saat ini salah");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });
  if (error) return actionError("Gagal mengubah password");

  return actionSuccess();
}
