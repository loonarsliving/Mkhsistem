"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getDisciplineEvidence, type DisciplineEvidence } from "@/repositories/hr-discipline.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  issueWarningSchema,
  revokeActionSchema,
  terminateEmployeeSchema,
  type IssueWarningInput,
  type RevokeActionInput,
  type TerminateEmployeeInput,
} from "../schemas/hr-discipline.schema";

/**
 * Every write here is an RPC call, never a table write. The RPCs are
 * security definer and re-check the permission themselves, so these actions
 * are a validation + revalidation layer rather than the enforcement point --
 * hr_disciplinary_actions has no insert/update RLS policy at all.
 */

/** Read the record behind a decision before committing to it. Powers the evidence panel HR sees while drafting. */
export async function fetchDisciplineEvidenceAction(employeeId: string): Promise<ActionResult<DisciplineEvidence | null>> {
  await requirePermission("hr_discipline.view");
  const supabase = await createClient();
  try {
    return actionSuccess(await getDisciplineEvidence(supabase, employeeId));
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memuat data pendukung");
  }
}

export async function issueWarningAction(input: IssueWarningInput): Promise<ActionResult<{ id: string }>> {
  await requirePermission("hr_discipline.warn");
  const parsed = issueWarningSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_issue_warning", {
    p_employee_id: parsed.data.employeeId,
    p_action_type: parsed.data.actionType,
    p_reason_category: parsed.data.reasonCategory,
    p_description: parsed.data.description,
  });
  // The ladder rule (SP2 needs an active SP1) is enforced in the RPC, so its
  // message is the useful one -- surface it as-is rather than a generic error.
  if (error) return actionError(error.message);

  revalidatePath("/hr/discipline");
  revalidatePath("/hr");
  return actionSuccess({ id: data as string });
}

export async function terminateEmployeeAction(input: TerminateEmployeeInput): Promise<ActionResult<{ id: string }>> {
  await requirePermission("hr_discipline.terminate");
  const parsed = terminateEmployeeSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("hr_terminate_employee", {
    p_employee_id: parsed.data.employeeId,
    p_reason_category: parsed.data.reasonCategory,
    p_description: parsed.data.description,
    p_last_working_date: parsed.data.lastWorkingDate || null,
    p_bypass_justification: parsed.data.bypassJustification || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/discipline");
  revalidatePath("/hr");
  revalidatePath("/employees");
  return actionSuccess({ id: data as string });
}

export async function revokeDisciplinaryActionAction(input: RevokeActionInput): Promise<ActionResult> {
  await requirePermission("hr_discipline.warn");
  const parsed = revokeActionSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("hr_revoke_disciplinary_action", {
    p_id: parsed.data.id,
    p_reason: parsed.data.reason,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/discipline");
  return actionSuccess();
}
