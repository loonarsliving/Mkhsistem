"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { decideWbsProgressSchema, submitWbsProgressSchema, type DecideWbsProgressInput, type SubmitWbsProgressInput } from "../schemas/cm-wbs.schema";

/** Every write here is an RPC call -- cm_submit_wbs_progress / cm_decide_wbs_progress (migration 0209) are security definer. */

export async function submitWbsProgressAction(input: SubmitWbsProgressInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = submitWbsProgressSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cm_submit_wbs_progress", {
    p_project_wbs_id: parsed.data.projectWbsId,
    p_progress_pct: parsed.data.progressPct,
    p_photo_url: parsed.data.photoUrl || null,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess({ id: data as string });
}

export async function decideWbsProgressAction(input: DecideWbsProgressInput): Promise<ActionResult> {
  await requireSession();
  const parsed = decideWbsProgressSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("cm_decide_wbs_progress", {
    p_log_id: parsed.data.logId,
    p_approve: parsed.data.approve,
    p_reject_reason: parsed.data.rejectReason || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/construction-finance");
  return actionSuccess();
}
