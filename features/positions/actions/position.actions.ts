"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { createPosition, deletePosition, updatePosition } from "@/repositories/position.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { positionSchema, type PositionInput } from "../schemas/position.schema";

export async function savePositionAction(input: PositionInput): Promise<ActionResult> {
  const session = await requirePermission("position.manage");
  const parsed = positionSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const payload = {
    code: parsed.data.code || null,
    name: parsed.data.name,
    level: parsed.data.level,
    description: parsed.data.description || null,
    is_active: parsed.data.isActive,
    updated_by: session.userId,
  };

  try {
    if (parsed.data.id) {
      await updatePosition(supabase, parsed.data.id, payload);
    } else {
      await createPosition(supabase, { ...payload, created_by: session.userId });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan jabatan");
  }

  revalidatePath("/positions");
  return actionSuccess();
}

export async function deletePositionAction(id: string): Promise<ActionResult> {
  await requirePermission("position.manage");
  const supabase = await createClient();
  try {
    await deletePosition(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus jabatan");
  }
  revalidatePath("/positions");
  return actionSuccess();
}
