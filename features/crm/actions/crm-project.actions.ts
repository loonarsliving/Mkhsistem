"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { createCrmProject, setCrmProjectActive, updateCrmProject } from "@/repositories/crm.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";
import type { CrmProjectStatusDb, CrmProjectTypeDb } from "@/types/database.types";

import { crmProjectSchema, type CrmProjectInput } from "../schemas/crm-project.schema";

export async function saveCrmProjectAction(input: CrmProjectInput): Promise<ActionResult> {
  const session = await requirePermission("crm_project.manage");
  const parsed = crmProjectSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const payload = {
    name: parsed.data.name,
    city: parsed.data.city || null,
    branch_id: parsed.data.branchId,
    project_type: parsed.data.projectType as CrmProjectTypeDb,
    status: parsed.data.status as CrmProjectStatusDb,
    start_date: parsed.data.startDate || null,
    target_launch_date: parsed.data.targetLaunchDate || null,
    updated_by: session.userId,
  };

  try {
    if (parsed.data.id) {
      await updateCrmProject(supabase, parsed.data.id, payload);
    } else {
      await createCrmProject(supabase, { ...payload, created_by: session.userId });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan project");
  }

  revalidatePath("/crm/projects");
  revalidatePath("/crm/new");
  return actionSuccess();
}

export async function setCrmProjectActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  const session = await requirePermission("crm_project.manage");
  const supabase = await createClient();

  try {
    await setCrmProjectActive(supabase, id, isActive, session.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memperbarui status project");
  }

  revalidatePath("/crm/projects");
  revalidatePath("/crm/new");
  return actionSuccess();
}
