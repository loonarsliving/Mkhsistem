"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  markSalaryTransferredSchema,
  sendSalarySummarySchema,
  submitEmployeeSalarySchema,
  type MarkSalaryTransferredInput,
  type SendSalarySummaryInput,
  type SubmitEmployeeSalaryInput,
} from "../schemas/salary-input.schema";

/**
 * Every write here is an RPC call, never a table write -- submit_employee_salary
 * and mark_salary_transferred (migration 0189) are security definer and
 * re-check the permission + branch scope themselves.
 */

export async function submitEmployeeSalaryAction(input: SubmitEmployeeSalaryInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = submitEmployeeSalarySchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_employee_salary", {
    p_employee_id: parsed.data.employeeId,
    p_period_month: parsed.data.periodMonth,
    p_period_year: parsed.data.periodYear,
    p_amount: parsed.data.amount,
    p_bank_name: parsed.data.bankName || null,
    p_bank_account_number: parsed.data.bankAccountNumber,
    p_bank_account_holder: parsed.data.bankAccountHolder || null,
    p_note: parsed.data.note || null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/salary");
  return actionSuccess({ id: data as string });
}

export async function markSalaryTransferredAction(input: MarkSalaryTransferredInput): Promise<ActionResult> {
  await requireSession();
  const parsed = markSalaryTransferredSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_salary_transferred", { p_id: parsed.data.id });
  if (error) return actionError(error.message);

  revalidatePath("/hr/salary");
  return actionSuccess();
}

export async function sendSalarySummaryAction(input: SendSalarySummaryInput): Promise<ActionResult<{ count: number }>> {
  await requireSession();
  const parsed = sendSalarySummarySchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("send_salary_transfer_summary", {
    p_branch_id: parsed.data.branchId ?? null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/salary");
  return actionSuccess({ count: data as number });
}
