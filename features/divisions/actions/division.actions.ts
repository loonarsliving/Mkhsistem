"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { createDivision, deleteDivision, updateDivision } from "@/repositories/division.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { divisionSchema, type DivisionInput } from "../schemas/division.schema";

export async function saveDivisionAction(input: DivisionInput): Promise<ActionResult> {
  const session = await requirePermission("division.manage");
  const parsed = divisionSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const payload = {
    branch_id: parsed.data.branchId,
    code: parsed.data.code || null,
    name: parsed.data.name,
    description: parsed.data.description || null,
    is_active: parsed.data.isActive,
    updated_by: session.userId,
  };

  try {
    if (parsed.data.id) {
      await updateDivision(supabase, parsed.data.id, payload);
    } else {
      await createDivision(supabase, { ...payload, created_by: session.userId });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan divisi");
  }

  revalidatePath("/divisions");
  return actionSuccess();
}

export async function deleteDivisionAction(id: string): Promise<ActionResult> {
  await requirePermission("division.manage");
  const supabase = await createClient();
  try {
    await deleteDivision(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus divisi");
  }
  revalidatePath("/divisions");
  return actionSuccess();
}
