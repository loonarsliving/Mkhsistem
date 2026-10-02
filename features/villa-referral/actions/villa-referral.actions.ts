"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PERMISSIONS } from "@/constants/rbac";
import { requirePermission } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createVillaReferral,
  sendReferralToEmployee,
  setVillaReferralActive,
} from "@/lib/villa/referral";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

const createSchema = z.object({
  employeeId: z.string().uuid(),
  kode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(REF-)?[A-Z0-9]{2,20}$/, "Kode hanya huruf/angka, 2-20 karakter")
    .optional()
    .or(z.literal("")),
  catatan: z.string().trim().max(200).optional(),
  kirimWa: z.boolean().default(true),
});

export type CreateVillaReferralInput = z.input<typeof createSchema>;

export async function createVillaReferralAction(
  input: CreateVillaReferralInput,
): Promise<ActionResult<{ kode: string; waNote: string | null }>> {
  const session = await requirePermission(PERMISSIONS.VILLA_REFERRAL_MANAGE);
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = createAdminClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("id", parsed.data.employeeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!employee) return actionError("Karyawan tidak ditemukan");

  const created = await createVillaReferral({
    employeeId: employee.id,
    employeeName: employee.full_name,
    kode: parsed.data.kode || null,
    catatan: parsed.data.catatan || null,
    createdBy: session.employee.full_name ?? "mkhsistem",
  });
  if (!created.ok) return actionError(created.error);

  let waNote: string | null = null;
  if (parsed.data.kirimWa) {
    const sent = await sendReferralToEmployee(
      employee.id,
      created.data.kode.kode,
      Number(created.data.kode.fee_persen),
    );
    waNote = sent.ok
      ? `Kode sudah dikirim ke WA ${sent.name}.`
      : `Kode dibuat, tapi ${sent.error}.`;
  }

  revalidatePath("/villa-referral");
  return actionSuccess({ kode: created.data.kode.kode, waNote });
}

export async function sendVillaReferralWaAction(input: {
  employeeId: string;
  kode: string;
  feePersen: number;
}): Promise<ActionResult<{ name: string }>> {
  await requirePermission(PERMISSIONS.VILLA_REFERRAL_MANAGE);
  const parsed = z
    .object({
      employeeId: z.string().uuid(),
      kode: z.string().regex(/^REF-[A-Z0-9]{2,20}$/),
      feePersen: z.number().positive().max(50),
    })
    .safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid");
  const sent = await sendReferralToEmployee(
    parsed.data.employeeId,
    parsed.data.kode,
    parsed.data.feePersen,
  );
  if (!sent.ok) return actionError(sent.error);
  return actionSuccess({ name: sent.name });
}

export async function setVillaReferralActiveAction(input: {
  id: string;
  aktif: boolean;
}): Promise<ActionResult> {
  await requirePermission(PERMISSIONS.VILLA_REFERRAL_MANAGE);
  const parsed = z.object({ id: z.string().uuid(), aktif: z.boolean() }).safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid");
  const result = await setVillaReferralActive(parsed.data.id, parsed.data.aktif);
  if (!result.ok) return actionError(result.error);
  revalidatePath("/villa-referral");
  return actionSuccess();
}
