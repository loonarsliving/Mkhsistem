"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  countPromoSendsByStatus,
  createPromoTemplate,
  deletePromoTemplate,
  listPromoSends,
  listPromoTemplates,
  setPromoTemplateActive,
  updatePromoTemplate,
} from "@/repositories/crm-promo.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { createPromoTemplateSchema, updatePromoTemplateSchema, type CreatePromoTemplateInput, type UpdatePromoTemplateInput } from "../schemas/promo-template.schema";

export async function listPromoTemplatesAction() {
  await requireSession();
  const supabase = await createClient();
  return listPromoTemplates(supabase);
}

export async function getPromoSendStatsAction(templateId: string) {
  await requireSession();
  const supabase = await createClient();
  return countPromoSendsByStatus(supabase, templateId);
}

export async function listPromoSendsAction(templateId: string) {
  await requireSession();
  const supabase = await createClient();
  return listPromoSends(supabase, templateId);
}

export async function createPromoTemplateAction(input: CreatePromoTemplateInput): Promise<ActionResult> {
  const session = await requirePermission("promo_template.manage");
  const parsed = createPromoTemplateSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await createPromoTemplate(supabase, {
      branch_id: parsed.data.branchId ?? null,
      name: parsed.data.name,
      message_body: parsed.data.messageBody,
      photo_storage_path: parsed.data.photoStoragePath ?? null,
      photo_public_url: parsed.data.photoPublicUrl ?? null,
      cadence_days: parsed.data.cadenceDays,
      send_hour_local: parsed.data.sendHourLocal,
      created_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan template");
  }

  revalidatePath("/markom/promo-broadcast");
  return actionSuccess();
}

export async function updatePromoTemplateAction(input: UpdatePromoTemplateInput): Promise<ActionResult> {
  const session = await requirePermission("promo_template.manage");
  const parsed = updatePromoTemplateSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const { id, ...rest } = parsed.data;
  const supabase = await createClient();
  try {
    await updatePromoTemplate(supabase, id, {
      ...(rest.branchId !== undefined && { branch_id: rest.branchId ?? null }),
      ...(rest.name !== undefined && { name: rest.name }),
      ...(rest.messageBody !== undefined && { message_body: rest.messageBody }),
      ...(rest.photoStoragePath !== undefined && { photo_storage_path: rest.photoStoragePath }),
      ...(rest.photoPublicUrl !== undefined && { photo_public_url: rest.photoPublicUrl }),
      ...(rest.cadenceDays !== undefined && { cadence_days: rest.cadenceDays }),
      ...(rest.sendHourLocal !== undefined && { send_hour_local: rest.sendHourLocal }),
      updated_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memperbarui template");
  }

  revalidatePath("/markom/promo-broadcast");
  return actionSuccess();
}

export async function setPromoTemplateActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const session = await requirePermission("promo_template.manage");
  const supabase = await createClient();
  try {
    await setPromoTemplateActive(supabase, id, isActive, session.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah status template");
  }

  revalidatePath("/markom/promo-broadcast");
  return actionSuccess();
}

export async function deletePromoTemplateAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("promo_template.manage");
  const supabase = await createClient();
  try {
    await deletePromoTemplate(supabase, id, session.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus template");
  }

  revalidatePath("/markom/promo-broadcast");
  return actionSuccess();
}
