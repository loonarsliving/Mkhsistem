"use server";

import { revalidatePath } from "next/cache";

import { hasPermission, requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  createProjectPhoto,
  deleteProjectPhoto,
  listActiveCrmProjects,
  listProjectPhotos,
  updateProjectProductDescription,
} from "@/repositories/crm.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { createProjectPhotoSchema, type CreateProjectPhotoInput } from "../schemas/project-photo.schema";

/** Markom sees only their own branch's projects (mirrors kpi_task branch-scoping); directors/super admin see all. */
export async function listProjectsForPhotoUploadAction() {
  const session = await requireSession();
  const supabase = await createClient();
  const scopedToOwnBranch = !hasPermission(session, "crm_project.manage");
  return listActiveCrmProjects(supabase, scopedToOwnBranch ? session.employee.branch_id : undefined);
}

export async function listProjectPhotosAction(projectId?: string) {
  await requireSession();
  const supabase = await createClient();
  return listProjectPhotos(supabase, projectId);
}

export async function createProjectPhotoAction(input: CreateProjectPhotoInput): Promise<ActionResult> {
  const session = await requirePermission("crm_project_photo.manage");
  const parsed = createProjectPhotoSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await createProjectPhoto(supabase, {
      project_id: parsed.data.projectId,
      storage_path: parsed.data.storagePath,
      public_url: parsed.data.publicUrl,
      caption: parsed.data.caption || null,
      uploaded_by: session.userId,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan foto");
  }

  revalidatePath("/markom/photos");
  return actionSuccess();
}

/** Grounds the AI ad-drafting pipeline in the actual product (price/specs/USP/target buyer) instead of just name+city+type -- see lib/ai/domains/markom.ts's researchAndDraftAd. */
export async function updateProjectProductDescriptionAction(projectId: string, productDescription: string): Promise<ActionResult> {
  const session = await requirePermission("crm_project_photo.manage");
  if (productDescription.length > 2000) return actionError("Deskripsi produk maksimal 2000 karakter");

  const supabase = await createClient();
  try {
    await updateProjectProductDescription(supabase, projectId, productDescription.trim(), session.userId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan deskripsi produk");
  }

  revalidatePath("/markom/photos");
  return actionSuccess();
}

export async function deleteProjectPhotoAction(id: string): Promise<ActionResult> {
  await requirePermission("crm_project_photo.manage");
  const supabase = await createClient();
  try {
    await deleteProjectPhoto(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus foto");
  }

  revalidatePath("/markom/photos");
  return actionSuccess();
}
