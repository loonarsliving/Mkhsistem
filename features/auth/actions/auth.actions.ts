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

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  const ip = await clientIp();
  await supabase.rpc("record_login_attempt", { p_email: parsed.data.email, p_success: !error, p_ip_address: ip });

  if (error) {
    if (error.message.toLowerCase().includes("invalid login credentials")) {
      return actionError("Email atau password salah");
    }
    return actionError("Gagal masuk. Silakan coba lagi.");
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
