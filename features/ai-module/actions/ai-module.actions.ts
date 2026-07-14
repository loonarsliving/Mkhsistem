"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { updateSystemPromptSchema, type UpdateSystemPromptInput } from "../schemas/ai-module.schema";

export async function listSystemPromptsAction() {
  await requirePermission("ai_module.manage");
  const supabase = await createClient();
  const { data, error } = await supabase.from("ai_system_prompts").select("key, label, content, updated_at").order("key");
  if (error) throw new Error(error.message);
  return data;
}

/** Edits the AI's per-domain instructions -- read by lib/ai/domains/prompts.ts (60s cache) for every WhatsApp AI reply. */
export async function updateSystemPromptAction(input: UpdateSystemPromptInput): Promise<ActionResult> {
  const session = await requirePermission("ai_module.manage");
  const parsed = updateSystemPromptSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_system_prompts")
    .update({ content: parsed.data.content, updated_by: session.userId, updated_at: new Date().toISOString() })
    .eq("key", parsed.data.key);

  if (error) return actionError(error.message);

  revalidatePath("/ai");
  return actionSuccess();
}
