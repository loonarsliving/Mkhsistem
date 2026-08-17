"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  createKnowledgeBase,
  setKnowledgeBaseActive,
  updateKnowledgeBase,
} from "@/repositories/knowledge-base.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { knowledgeBaseSchema, type KnowledgeBaseInput } from "../schemas/knowledge-base.schema";

/** Manual entries only -- "dari_admin" (Super Admin's WhatsApp answers auto-banked here by lib/ai/domains/lead-nurture.ts's tryHandleSuperadminAnswer) is never set from this form. */
export async function saveKnowledgeBaseAction(input: KnowledgeBaseInput): Promise<ActionResult> {
  const session = await requirePermission("prospect.manage");
  const parsed = knowledgeBaseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const payload = {
    project_id: parsed.data.projectId,
    kategori: parsed.data.kategori,
    pertanyaan_umum: parsed.data.pertanyaanUmum,
    jawaban: parsed.data.jawaban,
    updated_by: session.userId,
  };

  try {
    if (parsed.data.id) {
      await updateKnowledgeBase(supabase, parsed.data.id, payload);
    } else {
      await createKnowledgeBase(supabase, {
        ...payload,
        sumber: "manual",
        created_by: session.userId,
      });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan knowledge base");
  }

  revalidatePath("/crm/knowledge-base");
  return actionSuccess();
}

export async function setKnowledgeBaseActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  const session = await requirePermission("prospect.manage");
  const supabase = await createClient();

  try {
    await setKnowledgeBaseActive(supabase, id, isActive, session.userId);
  } catch (err) {
    return actionError(
      err instanceof Error ? err.message : "Gagal memperbarui status knowledge base",
    );
  }

  revalidatePath("/crm/knowledge-base");
  return actionSuccess();
}
