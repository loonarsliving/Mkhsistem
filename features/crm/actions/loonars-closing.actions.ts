"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";
import { listMyLoonarsClosings, listPendingLoonarsClosings } from "@/repositories/loonars-closing.repository";

export async function listPendingLoonarsClosingsAction() {
  await requireSession();
  const supabase = await createClient();
  return listPendingLoonarsClosings(supabase);
}

export async function listMyLoonarsClosingsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  return listMyLoonarsClosings(supabase, session.userId);
}

export async function verifyLoonarsClosingAction(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_closing_verify", { p_id: id });
  if (error) return actionError(error.message);

  revalidatePath("/crm/finance");
  return actionSuccess();
}

export async function rejectLoonarsClosingAction(id: string, reason?: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_closing_reject", { p_id: id, p_reason: reason ?? null });
  if (error) return actionError(error.message);

  revalidatePath("/crm/finance");
  return actionSuccess();
}

export async function requestLoonarsFeeAction(id: string, feeAmount: number): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("loonars_fee_request", { p_id: id, p_fee_amount: feeAmount });
  if (error) return actionError(error.message);

  revalidatePath("/dashboard");
  return actionSuccess();
}
