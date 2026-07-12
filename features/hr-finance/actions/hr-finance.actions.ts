"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  approvePayrollRunSchema,
  createHrExpenseSchema,
  createPayrollRunSchema,
  rejectHrExpenseSchema,
  type ApprovePayrollRunInput,
  type CreateHrExpenseInput,
  type CreatePayrollRunInput,
  type RejectHrExpenseInput,
} from "../schemas/hr-finance.schema";

export async function createHrExpenseAction(input: CreateHrExpenseInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createHrExpenseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_hr_expense", {
    p_expense_type: parsed.data.expenseType,
    p_employee_id: parsed.data.employeeId,
    p_branch_id: parsed.data.branchId,
    p_amount: parsed.data.amount,
    p_expense_date: parsed.data.expenseDate,
    p_description: parsed.data.description,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/finance-sync");
  return actionSuccess({ id: data as string });
}

export async function approveHrExpenseAction(hrExpenseId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_hr_expense", { p_id: hrExpenseId });
  if (error) return actionError(error.message);

  revalidatePath("/hr/finance-sync");
  return actionSuccess();
}

export async function rejectHrExpenseAction(input: RejectHrExpenseInput): Promise<ActionResult> {
  await requireSession();
  const parsed = rejectHrExpenseSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_hr_expense", {
    p_id: parsed.data.hrExpenseId,
    p_reason: parsed.data.reason ?? null,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/finance-sync");
  return actionSuccess();
}

export async function createPayrollRunAction(input: CreatePayrollRunInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createPayrollRunSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_payroll_run", {
    p_branch_id: parsed.data.branchId,
    p_period_month: parsed.data.periodMonth,
    p_period_year: parsed.data.periodYear,
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/finance-sync");
  return actionSuccess({ id: data as string });
}

export async function approvePayrollRunAction(input: ApprovePayrollRunInput): Promise<ActionResult> {
  await requireSession();
  const parsed = approvePayrollRunSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_payroll_run", {
    p_payroll_run_id: parsed.data.payrollRunId,
    p_items: parsed.data.items.map((item) => ({
      employee_id: item.employeeId,
      base_salary: item.baseSalary,
      allowances: item.allowances,
      deductions: item.deductions,
    })),
  });
  if (error) return actionError(error.message);

  revalidatePath("/hr/finance-sync");
  return actionSuccess();
}
