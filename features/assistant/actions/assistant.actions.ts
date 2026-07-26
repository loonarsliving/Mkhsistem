"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { deleteFollowup, insertFollowup, setFollowupStatus } from "@/repositories/assistant.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { createFollowupSchema, type CreateFollowupInput } from "../schemas/assistant.schema";

/**
 * The assistant workspace's only write path. Everything else on /asisten is
 * read-only by design -- the role holds no approve/verify permission, so
 * these actions can only ever touch the assistant's own chase list.
 *
 * owner_id is taken from the session, never from the client, and the RLS
 * policy on assistant_followups re-checks it (owner_id = auth.uid()), so one
 * assistant can never read or edit another's list even by guessing an id.
 */
export async function createFollowupAction(input: CreateFollowupInput): Promise<ActionResult> {
  const session = await requirePermission("assistant_followup.manage");
  const parsed = createFollowupSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  try {
    await insertFollowup(supabase, {
      owner_id: session.userId,
      title: parsed.data.title,
      assigned_to: parsed.data.assignedTo || null,
      due_date: parsed.data.dueDate || null,
      notes: parsed.data.notes || null,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan tindak lanjut");
  }

  revalidatePath("/asisten");
  return actionSuccess();
}

export async function toggleFollowupAction(id: string, done: boolean): Promise<ActionResult> {
  await requirePermission("assistant_followup.manage");

  const supabase = await createClient();
  try {
    await setFollowupStatus(supabase, id, done ? "done" : "open");
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memperbarui tindak lanjut");
  }

  revalidatePath("/asisten");
  return actionSuccess();
}

export async function deleteFollowupAction(id: string): Promise<ActionResult> {
  await requirePermission("assistant_followup.manage");

  const supabase = await createClient();
  try {
    await deleteFollowup(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus tindak lanjut");
  }

  revalidatePath("/asisten");
  return actionSuccess();
}
