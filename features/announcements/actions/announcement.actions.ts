"use server";

import { revalidatePath } from "next/cache";

import { requirePermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { deleteAnnouncement, listAnnouncementCategories } from "@/repositories/announcement.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  announcementCategorySchema,
  announcementFormSchema,
  type AnnouncementCategoryInput,
  type AnnouncementFormInput,
} from "../schemas/announcement.schema";

export async function createAnnouncementAction(input: AnnouncementFormInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = announcementFormSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_announcement", {
    p_title: parsed.data.title,
    p_content: parsed.data.content,
    p_category_id: parsed.data.categoryId,
    p_is_pinned: parsed.data.isPinned,
    p_expires_at: parsed.data.expiresAt || null,
    p_targets: parsed.data.targets,
    p_attachments: parsed.data.attachments,
  });

  if (error) return actionError(error.message);

  revalidatePath("/announcements");
  revalidatePath("/dashboard");
  return actionSuccess({ id: data as string });
}

export async function deleteAnnouncementAction(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  try {
    await deleteAnnouncement(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus pengumuman");
  }
  revalidatePath("/announcements");
  return actionSuccess();
}

export async function listAnnouncementCategoriesAction() {
  await requireSession();
  const supabase = await createClient();
  return listAnnouncementCategories(supabase);
}

export async function saveAnnouncementCategoryAction(input: AnnouncementCategoryInput): Promise<ActionResult> {
  const session = await requirePermission("announcement.manage");
  const parsed = announcementCategorySchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { id, ...rest } = parsed.data;

  const { error } = id
    ? await supabase.from("announcement_categories").update({ ...rest, updated_by: session.userId }).eq("id", id)
    : await supabase.from("announcement_categories").insert({ ...rest, created_by: session.userId, updated_by: session.userId });

  if (error) return actionError(error.message);

  revalidatePath("/announcements");
  return actionSuccess();
}

export async function deleteAnnouncementCategoryAction(id: string): Promise<ActionResult> {
  await requirePermission("announcement.manage");
  const supabase = await createClient();
  const { error } = await supabase.from("announcement_categories").delete().eq("id", id);
  if (error) return actionError("Gagal menghapus kategori (mungkin masih digunakan)");
  revalidatePath("/announcements");
  return actionSuccess();
}
