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
  saveAndDistributeTargetSchema,
  setProductSalesAssignmentSchema,
  upsertProductSchema,
  type AddFollowUpInput,
  type AddProspectInput,
  type RecordPaymentInput,
  type RejectPaymentInput,
  type SaveAndDistributeTargetInput,
  type SetProductSalesAssignmentInput,
  type UpsertProductInput,
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

export async function saveAndDistributeTargetAction(
  input: SaveAndDistributeTargetInput,
): Promise<ActionResult<{ distributedCount: number; totalTargetUnits: number; totalTargetRevenue: number }>> {
  await requireSession();
  const parsed = saveAndDistributeTargetSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_save_and_distribute_target", {
    p_branch_id: parsed.data.branchId,
    p_period_month: parsed.data.periodMonth,
    p_period_year: parsed.data.periodYear,
    p_details: parsed.data.details.map((d) => ({
      product_id: d.productId,
      target_unit: d.targetUnit,
      selling_price: d.sellingPrice,
      commission_percent: d.commissionPercent,
    })),
  });

  if (error) return actionError(error.message);

  revalidatePath("/crm/targets");
  revalidatePath("/dashboard");
  const row = data?.[0];
  return actionSuccess({
    distributedCount: row?.distributed_count ?? 0,
    totalTargetUnits: row?.total_target_units ?? 0,
    totalTargetRevenue: row?.total_target_revenue ?? 0,
  });
}

export async function upsertProductAction(input: UpsertProductInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = upsertProductSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_upsert_product", {
    p_id: parsed.data.id ?? null,
    p_product_name: parsed.data.productName,
    p_category: parsed.data.category ?? null,
    p_unit: parsed.data.unit,
    p_default_price: parsed.data.defaultPrice,
    p_default_commission: parsed.data.defaultCommission,
    p_status: parsed.data.status,
  });

  if (error) return actionError(error.message);

  revalidatePath("/crm/targets");
  return actionSuccess({ id: data as unknown as string });
}

export async function setProductSalesAssignmentAction(input: SetProductSalesAssignmentInput): Promise<ActionResult> {
  await requireSession();
  const parsed = setProductSalesAssignmentSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("crm_set_product_sales_assignment", {
    p_product_id: parsed.data.productId,
    p_sales_id: parsed.data.salesId,
    p_assigned: parsed.data.assigned,
  });

  if (error) return actionError(error.message);

  revalidatePath("/crm/targets");
  return actionSuccess();
}
