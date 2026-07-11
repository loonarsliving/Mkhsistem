"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";
import type { FollowUpActivityTypeDb, LeadSourceDb, PaymentTypeDb } from "@/types/database.types";

import {
  addFollowUpSchema,
  addProspectSchema,
  recordPaymentSchema,
  rejectPaymentSchema,
  setBranchTargetSchema,
  type AddFollowUpInput,
  type AddProspectInput,
  type RecordPaymentInput,
  type RejectPaymentInput,
  type SetBranchTargetInput,
} from "../schemas/crm.schema";

export async function checkDuplicateProspectAction(phone: string, customerName: string) {
  await requireSession();
  if (phone.trim().length < 6 || customerName.trim().length < 2) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_find_duplicate_prospect", {
    p_phone: phone,
    p_customer_name: customerName,
  });
  if (error) throw error;
  return data?.[0] ?? null;
}

export async function createProspectAction(input: AddProspectInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = addProspectSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_create_prospect", {
    p_customer_name: parsed.data.customerName,
    p_phone: parsed.data.phone,
    p_project_id: null,
    p_house_type: parsed.data.houseType,
    p_city: parsed.data.city,
    p_lead_source: parsed.data.leadSource as LeadSourceDb,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/crm");
  return actionSuccess({ id: data as string });
}

export async function addFollowUpAction(input: AddFollowUpInput): Promise<ActionResult> {
  await requireSession();
  const parsed = addFollowUpSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_add_follow_up", {
    p_prospect_id: parsed.data.prospectId,
    p_activity_type: parsed.data.activityType as FollowUpActivityTypeDb,
    p_activity_date: parsed.data.activityDate,
    p_activity_time: parsed.data.activityTime || null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/crm");
  revalidatePath(`/crm/${parsed.data.prospectId}`);
  return actionSuccess();
}

export async function setProspectGreenAction(prospectId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_set_prospect_green", { p_prospect_id: prospectId });
  if (error) return actionError(error.message);

  revalidatePath("/crm");
  revalidatePath(`/crm/${prospectId}`);
  return actionSuccess();
}

export async function recordPaymentAction(input: RecordPaymentInput): Promise<ActionResult> {
  await requireSession();
  const parsed = recordPaymentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_record_payment", {
    p_prospect_id: parsed.data.prospectId,
    p_payment_type: parsed.data.paymentType as PaymentTypeDb,
    p_amount: parsed.data.amount,
    p_payment_date: parsed.data.paymentDate,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/crm/finance");
  revalidatePath(`/crm/${parsed.data.prospectId}`);
  return actionSuccess();
}

export async function approvePaymentAction(paymentId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_approve_payment", { p_payment_id: paymentId });
  if (error) return actionError(error.message);

  revalidatePath("/dashboard");
  revalidatePath("/crm");
  revalidatePath("/crm/finance");
  return actionSuccess();
}

export async function rejectPaymentAction(input: RejectPaymentInput): Promise<ActionResult> {
  await requireSession();
  const parsed = rejectPaymentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_reject_payment", {
    p_payment_id: parsed.data.paymentId,
    p_reason: parsed.data.reason ?? null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/crm/finance");
  return actionSuccess();
}

export async function setBranchTargetAction(input: SetBranchTargetInput): Promise<ActionResult<{ distributedCount: number }>> {
  await requireSession();
  const parsed = setBranchTargetSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_set_branch_target", {
    p_branch_id: parsed.data.branchId,
    p_period_month: parsed.data.periodMonth,
    p_period_year: parsed.data.periodYear,
    p_target_units: parsed.data.targetUnits,
    p_selling_price_per_unit: parsed.data.sellingPricePerUnit,
    p_commission_percent: parsed.data.commissionPercent,
  });

  if (error) return actionError(error.message);

  revalidatePath("/crm/targets");
  revalidatePath("/dashboard");
  return actionSuccess({ distributedCount: data?.[0]?.distributed_count ?? 0 });
}
