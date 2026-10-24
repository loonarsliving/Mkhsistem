"use server";

import { revalidatePath } from "next/cache";

import { departmentKind } from "@/lib/connect/labels";
import { localParts } from "@/lib/hospitality/time";
import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getConversationDepartment } from "@/repositories/chat.repository";
import { listMarkomOpenWork, listSalesOpenWork, type MarkomOpenWork, type SalesOpenWork } from "@/repositories/connect.repository";
import type { FollowUpActivityTypeDb, LeadSourceDb } from "@/types/database.types";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { conversationIdSchema, type ConversationIdInput } from "../schemas/chat.schema";
import {
  createContentSchema,
  createKolSchema,
  createLeadSchema,
  dailyReportSchema,
  decideKolSchema,
  salesFollowUpSchema,
  scheduleVisitSchema,
  updateContentSchema,
  updateKolSchema,
  visitResultSchema,
  type CreateContentInput,
  type CreateKolInput,
  type CreateLeadInput,
  type DailyReportInput,
  type DecideKolInput,
  type SalesFollowUpInput,
  type ScheduleVisitInput,
  type UpdateContentInput,
  type UpdateKolInput,
  type VisitResultInput,
} from "../schemas/connect.schema";

/**
 * Markom Jogja / Sales Jogja group actions (0294). Same contract as
 * chat.actions.ts: session + Zod here, then a security-definer RPC that checks
 * the caller's group role (markom / room_approver / sales / manager) itself.
 * CRM writes go through the CRM's own RPCs, so its permission rules apply.
 */

function invalid<T>(error: { flatten: () => { fieldErrors: Record<string, string[]> } }): ActionResult<T> {
  return actionError<T>("Data tidak valid", error.flatten().fieldErrors);
}

function dbError<T>(message: string): ActionResult<T> {
  return actionError<T>(message.replace(/^.*?ERROR:\s*/i, ""));
}

export async function loadConnectWorkAction(input: ConversationIdInput): Promise<ActionResult<MarkomOpenWork | SalesOpenWork>> {
  await requireSession();
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const dept = await getConversationDepartment(supabase, parsed.data.conversationId);
  if (!dept) return actionError("Percakapan tidak ditemukan");
  try {
    const kind = departmentKind(dept.code);
    if (kind === "markom") return actionSuccess(await listMarkomOpenWork(supabase, dept.id, localParts(new Date(), dept.timezone).date));
    if (kind === "sales") return actionSuccess(await listSalesOpenWork(supabase, dept.code));
    return actionError("Bukan grup Markom/Sales");
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memuat pekerjaan terbuka");
  }
}

// ---- Markom ----
export async function createContentAction(input: CreateContentInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createContentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("mkc_mkt_content_create", {
    p_department_code: d.departmentCode,
    p_planned_date: d.plannedDate,
    p_platform: d.platform,
    p_format: d.format,
    p_topic: d.topic,
    p_title: d.title,
    p_brief: d.brief,
    p_pic_id: d.picId ?? null,
    p_kol_id: d.kolId ?? null,
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

export async function updateContentAction(input: UpdateContentInput): Promise<ActionResult> {
  await requireSession();
  const parsed = updateContentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("mkc_mkt_content_update", {
    p_id: d.id,
    p_action: d.action,
    p_date: d.date ?? null,
    p_url: d.url ?? null,
    p_pic_id: d.picId ?? null,
    p_note: d.note,
  });
  return error ? dbError(error.message) : actionSuccess();
}

export async function createKolAction(input: CreateKolInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createKolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("mkc_mkt_kol_create", {
    p_department_code: d.departmentCode,
    p_kol_handle: d.kolHandle,
    p_platform: d.platform,
    p_followers: d.followers ?? null,
    p_niche: d.niche,
    p_compensation: d.compensation,
    p_requested_checkin: d.requestedCheckin,
    p_nights: d.nights,
    p_deliverables: d.deliverables,
    p_notes: d.notes,
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

export async function decideKolAction(input: DecideKolInput): Promise<ActionResult<{ voucherKode: string | null }>> {
  await requireSession();
  const parsed = decideKolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("mkc_mkt_kol_decide", {
    p_kol_id: d.kolId,
    p_decision: d.decision,
    p_unit_id: d.unitId ?? null,
    p_checkin: d.checkin ?? null,
    p_nights: d.nights ?? null,
    p_note: d.note,
  });
  if (error) return dbError(error.message);
  return actionSuccess({ voucherKode: ((data as { voucher_kode?: string } | null)?.voucher_kode as string | undefined) ?? null });
}

export async function updateKolAction(input: UpdateKolInput): Promise<ActionResult> {
  await requireSession();
  const parsed = updateKolSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("mkc_mkt_kol_update", {
    p_kol_id: d.kolId,
    p_action: d.action,
    p_key: d.key ?? null,
    p_url: d.url ?? null,
    p_note: d.note,
  });
  return error ? dbError(error.message) : actionSuccess();
}

// ---- Sales ----
/** New lead: created in the CRM (its own rules, round-robin, duplicate guard), then posted to the group. */
export async function createLeadAction(input: CreateLeadInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("crm_create_prospect", {
    p_customer_name: d.customerName,
    p_phone: d.phone,
    p_project_id: null,
    p_house_type: d.houseType,
    p_city: d.city,
    p_lead_source: d.leadSource as LeadSourceDb,
    p_notes: d.notes,
  });
  if (error) return dbError(error.message);
  const prospectId = data as string;
  // If this fails (e.g. the CRM gave the lead to another sales), the 10-minute
  // sync still posts it to the group; the lead itself is already saved.
  await supabase.rpc("mkc_sales_post_lead", { p_department_code: d.departmentCode, p_prospect_id: prospectId });
  revalidatePath("/crm");
  return actionSuccess({ id: prospectId });
}

export async function salesFollowUpAction(input: SalesFollowUpInput): Promise<ActionResult> {
  await requireSession();
  const parsed = salesFollowUpSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("mkc_sales_follow_up", {
    p_department_code: d.departmentCode,
    p_prospect_id: d.prospectId,
    p_activity_type: d.activityType as FollowUpActivityTypeDb,
    p_notes: d.notes,
  });
  if (error) return dbError(error.message);
  revalidatePath("/crm");
  return actionSuccess();
}

export async function scheduleVisitAction(input: ScheduleVisitInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = scheduleVisitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("mkc_sales_visit_schedule", {
    p_department_code: d.departmentCode,
    p_prospect_id: d.prospectId,
    p_scheduled_at: d.scheduledAt,
    p_note: d.note,
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

export async function visitResultAction(input: VisitResultInput): Promise<ActionResult> {
  await requireSession();
  const parsed = visitResultSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("mkc_sales_visit_result", {
    p_visit_id: d.visitId,
    p_outcome: d.outcome,
    p_interest: d.interest ?? null,
    p_note: d.note,
  });
  if (error) return dbError(error.message);
  revalidatePath("/crm");
  return actionSuccess();
}

export async function dailyReportAction(input: DailyReportInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = dailyReportSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("mkc_sales_daily_report_submit", {
    p_department_code: d.departmentCode,
    p_items: d.items,
    p_follow_ups: d.followUps,
    p_visits: d.visits,
    p_hot: d.hot,
    p_notes: d.notes,
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}
