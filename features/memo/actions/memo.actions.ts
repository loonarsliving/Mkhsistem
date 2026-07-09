"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { deleteMemo } from "@/repositories/memo.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { memoFormSchema, type MemoFormInput } from "../schemas/memo.schema";

export async function createMemoAction(input: MemoFormInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = memoFormSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_memo", {
    p_title: parsed.data.title,
    p_content: parsed.data.content,
    p_priority: parsed.data.priority,
    p_is_pinned: parsed.data.isPinned,
    p_is_mandatory_read: parsed.data.isMandatoryRead,
    p_expires_at: parsed.data.expiresAt || null,
    p_targets: parsed.data.targets,
    p_attachments: parsed.data.attachments,
  });

  if (error) return actionError(error.message);

  revalidatePath("/memo");
  revalidatePath("/dashboard");
  return actionSuccess({ id: data as string });
}

export async function markMemoReadAction(memoId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_memo_read", { p_memo_id: memoId });
  if (error) return actionError(error.message);
  revalidatePath(`/memo/${memoId}`);
  return actionSuccess();
}

export async function deleteMemoAction(memoId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  try {
    await deleteMemo(supabase, memoId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus memo");
  }
  revalidatePath("/memo");
  return actionSuccess();
}
