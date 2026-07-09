"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { createBranch, deleteBranch, updateBranch } from "@/repositories/branch.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { branchSchema, type BranchInput } from "../schemas/branch.schema";

export async function saveBranchAction(input: BranchInput): Promise<ActionResult> {
  const session = await requirePermission("branch.manage");
  const parsed = branchSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const payload = {
    code: parsed.data.code,
    name: parsed.data.name,
    address: parsed.data.address || null,
    city: parsed.data.city || null,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    radius_meters: parsed.data.radiusMeters,
    phone: parsed.data.phone || null,
    is_head_office: parsed.data.isHeadOffice,
    is_active: parsed.data.isActive,
    updated_by: session.userId,
  };

  try {
    if (parsed.data.id) {
      await updateBranch(supabase, parsed.data.id, payload);
    } else {
      await createBranch(supabase, { ...payload, created_by: session.userId });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan cabang");
  }

  revalidatePath("/branches");
  return actionSuccess();
}

export async function deleteBranchAction(id: string): Promise<ActionResult> {
  await requirePermission("branch.manage");
  const supabase = await createClient();
  try {
    await deleteBranch(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus cabang (mungkin masih memiliki karyawan)");
  }
  revalidatePath("/branches");
  return actionSuccess();
}
