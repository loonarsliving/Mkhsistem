"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess } from "@/types/domain";
import type { ActionResult } from "@/types/domain";

import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
} from "../schemas/auth.schema";

async function clientIp(): Promise<string | null> {
  const headerList = await headers();
  return headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headerList.get("x-real-ip") ?? null;
}

export async function loginAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();

  const { data: locked } = await supabase.rpc("check_login_lockout", { p_email: parsed.data.email });
  if (locked) {
    return actionError("Terlalu banyak percobaan gagal. Coba lagi dalam 15 menit.");
  }

  const { error, data } = await supabase.auth.signInWithPassword(parsed.data);
  const ip = await clientIp();
  await supabase.rpc("record_login_attempt", { p_email: parsed.data.email, p_success: !error, p_ip_address: ip });

  if (error) {
    if (error.message.toLowerCase().includes("invalid login credentials")) {
      return actionError("Email atau password salah");
    }
    return actionError("Gagal masuk. Silakan coba lagi.");
  }

  // Valid Supabase Auth credentials aren't enough for a self-registered
  // account — it also needs sign-off from an authorized approver. Check
  // after sign-in (not before) since this must hold even if someone tries
  // to skip straight to signInWithPassword.
  const { data: employee } = await supabase
    .from("employees")
    .select("approval_status, is_active")
    .eq("id", data.user.id)
    .single();

  if (employee && (employee.approval_status !== "approved" || !employee.is_active)) {
    await supabase.auth.signOut();
    if (employee.approval_status === "rejected") {
      return actionError("Pendaftaran Anda ditolak. Hubungi HR untuk informasi lebih lanjut.");
    }
    return actionError("Akun Anda sedang menunggu persetujuan. Anda akan menerima akses login setelah akun disetujui.");
  }

  return actionSuccess();
}

export async function logoutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function forgotPasswordAction(input: ForgotPasswordInput): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`;

  // Always report success regardless of whether the email exists, to avoid
  // leaking which addresses are registered.
  await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo });

  return actionSuccess();
}

export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (error) {
    return actionError("Gagal mengubah password. Tautan mungkin telah kedaluwarsa.");
  }

  return actionSuccess();
}
