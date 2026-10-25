"use server";

import { PERMISSIONS } from "@/constants/rbac";
import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { generateManualHospitalityReport } from "@/lib/hospitality/report-generator";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createWaMediaUrl } from "@/lib/wa-media/link";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  getDepartmentId,
  listChatConversations,
  listChatMessages,
  listDirectContacts,
  listOpenWork,
  searchChatMessages,
  type ChatContact,
  type ChatConversation,
  type ChatMessage,
  type ChatRefs,
  type IssueRef,
  type RoomTaskRef,
} from "@/repositories/chat.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  assignTaskSchema,
  blockTaskSchema,
  conversationIdSchema,
  createIssueSchema,
  foInspectSchema,
  loadMessagesSchema,
  openDirectChatSchema,
  reassignWaLeadSchema,
  sendWaLeadSchema,
  registerAttachmentSchema,
  reportIdSchema,
  retentionHoldSchema,
  searchMessagesSchema,
  sendTextSchema,
  submitCleaningSchema,
  submitSecuritySchema,
  taskIdSchema,
  updateIssueSchema,
  type AssignTaskInput,
  type BlockTaskInput,
  type ConversationIdInput,
  type CreateIssueInput,
  type FoInspectInput,
  type LoadMessagesInput,
  type OpenDirectChatInput,
  type ReassignWaLeadInput,
  type SendWaLeadInput,
  type RegisterAttachmentInput,
  type ReportIdInput,
  type RetentionHoldInput,
  type SearchMessagesInput,
  type SendTextInput,
  type SubmitCleaningInput,
  type SubmitSecurityInput,
  type TaskIdInput,
  type UpdateIssueInput,
} from "../schemas/chat.schema";

/**
 * Loonars Connect mutations (0291). Every action requires a session, then
 * calls a security-definer RPC that independently checks group membership
 * and the caller's group role (cleaning / front_office / security /
 * manager) or the owner permission. The UI hiding a button is never the
 * control; these RPCs are.
 */

function invalid<T>(error: { flatten: () => { fieldErrors: Record<string, string[]> } }): ActionResult<T> {
  return actionError<T>("Data tidak valid", error.flatten().fieldErrors);
}

function dbError<T>(message: string): ActionResult<T> {
  // Postgres raise messages here are written for staff; keep them, drop internals.
  return actionError<T>(message.replace(/^.*?ERROR:\s*/i, ""));
}

export async function listConversationsAction(): Promise<ActionResult<ChatConversation[]>> {
  await requireSession();
  try {
    return actionSuccess(await listChatConversations(await createClient()));
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memuat percakapan");
  }
}

/**
 * WhatsApp lead (0303): the assigned sales person's reply. The RPC records it
 * (pending) after checking the caller holds the lead; then it goes to the
 * customer's WhatsApp from the company number (Whacenter, like the refund
 * chat) and the outcome is stored on the message -- a failed send stays
 * visible as "gagal terkirim".
 */
export async function sendWaLeadMessageAction(input: SendWaLeadInput): Promise<ActionResult<{ id: string; delivered: boolean; error?: string }>> {
  await requireSession();
  const parsed = sendWaLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("mkc_wa_lead_queue_out", {
    p_conversation_id: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_attachment_ids: parsed.data.attachmentIds,
  });
  if (error) return dbError(error.message);
  const queued = data as { message_id: string; phone: string; object_paths: string[] };

  let result: { success: boolean; error?: string } = { success: true };
  try {
    const photos = queued.object_paths ?? [];
    if (photos.length === 0) {
      result = await sendWhatsAppText(queued.phone, parsed.data.body);
    } else {
      // Whacenter fetches each photo right away; the caption rides on the first one.
      // Every photo is attempted: Whacenter has answered 500 for a photo it still
      // delivered (2026-10-25), and stopping there left the next photo unsent.
      const failures: string[] = [];
      for (const [i, path] of photos.entries()) {
        const sent = await sendWhatsAppImage(queued.phone, createWaMediaUrl("hospitality-evidence", path, 60 * 60), i === 0 ? parsed.data.body || undefined : undefined);
        if (!sent.success) failures.push(`foto ${i + 1}: ${sent.error ?? "unknown error"}`);
      }
      if (failures.length > 0) result = { success: false, error: failures.join("; ") };
    }
  } catch (err) {
    result = { success: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (!result.success) logger.warn("wa-lead: WhatsApp send to customer failed", { messageId: queued.message_id, error: result.error });

  const { error: markError } = await createAdminClient().rpc("mkc_wa_lead_mark_out", {
    p_message_id: queued.message_id,
    p_ok: result.success,
    p_error: result.success ? null : (result.error ?? "unknown error"),
  });
  if (markError) logger.warn("wa-lead: delivery status not recorded", { messageId: queued.message_id, error: markError.message });
  // Saved either way (the bubble shows "Gagal terkirim"); the composer must not resend it.
  return actionSuccess({ id: queued.message_id, delivered: result.success, error: result.success ? undefined : (result.error ?? "unknown error") });
}

/** WhatsApp lead (0303): owner / manager moves a lead; the RPC checks the role and the rotation. */
export async function reassignWaLeadAction(input: ReassignWaLeadInput): Promise<ActionResult> {
  await requireSession();
  const parsed = reassignWaLeadSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_wa_lead_reassign", { p_lead_id: parsed.data.leadId, p_sales_id: parsed.data.salesId });
  return error ? dbError(error.message) : actionSuccess();
}

/** Direct chat (0300): people in scope; the RPC rejects callers outside it. */
export async function loadDirectContactsAction(): Promise<ActionResult<ChatContact[]>> {
  await requireSession();
  try {
    return actionSuccess(await listDirectContacts(await createClient()));
  } catch (err) {
    return dbError(err instanceof Error ? err.message : "Gagal memuat kontak");
  }
}

/** Opens (or reuses) the caller's direct chat with one person; scope is checked by the RPC. */
export async function openDirectChatAction(input: OpenDirectChatInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = openDirectChatSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("mkc_chat_direct_open", { p_employee_id: parsed.data.employeeId });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

export async function loadMessagesAction(
  input: LoadMessagesInput,
): Promise<ActionResult<{ messages: ChatMessage[]; refs: ChatRefs; hasMore: boolean }>> {
  await requireSession();
  const parsed = loadMessagesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return actionSuccess(await listChatMessages(await createClient(), parsed.data.conversationId, { before: parsed.data.before }));
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memuat pesan");
  }
}

export async function loadOpenWorkAction(input: ConversationIdInput): Promise<ActionResult<{ tasks: RoomTaskRef[]; issues: IssueRef[] }>> {
  await requireSession();
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const departmentId = await getDepartmentId(supabase, parsed.data.conversationId);
  if (!departmentId) return actionError("Percakapan tidak ditemukan");
  try {
    return actionSuccess(await listOpenWork(supabase, departmentId));
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memuat pekerjaan terbuka");
  }
}

export async function markReadAction(input: ConversationIdInput): Promise<ActionResult> {
  await requireSession();
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_chat_mark_read", { p_conversation_id: parsed.data.conversationId });
  return error ? dbError(error.message) : actionSuccess();
}

export async function sendTextAction(input: SendTextInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = sendTextSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("mkc_chat_send_message", {
    p_conversation_id: parsed.data.conversationId,
    p_body: parsed.data.body,
    p_attachment_ids: parsed.data.attachmentIds,
    p_reply_to_id: parsed.data.replyToId ?? null,
    // 0305: the 5-argument form (no defaults) only when someone is tagged
    ...(parsed.data.mentionIds.length > 0 ? { p_mention_ids: parsed.data.mentionIds } : {}),
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

/** Called after the browser uploaded the file straight to Storage (Vercel caps request bodies at 4.5MB). */
export async function registerAttachmentAction(input: RegisterAttachmentInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = registerAttachmentSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await (await createClient()).rpc("mkc_chat_register_attachment", {
    p_conversation_id: parsed.data.conversationId,
    p_object_path: parsed.data.objectPath,
    p_evidence_slot: parsed.data.evidenceSlot ?? null,
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

export async function startTaskAction(input: TaskIdInput): Promise<ActionResult> {
  await requireSession();
  const parsed = taskIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_task_start", { p_task_id: parsed.data.taskId });
  return error ? dbError(error.message) : actionSuccess();
}

export async function assignTaskAction(input: AssignTaskInput): Promise<ActionResult> {
  await requireSession();
  const parsed = assignTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_task_assign", { p_task_id: parsed.data.taskId, p_employee_id: parsed.data.employeeId });
  return error ? dbError(error.message) : actionSuccess();
}

export async function blockTaskAction(input: BlockTaskInput): Promise<ActionResult> {
  await requireSession();
  const parsed = blockTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_task_block", { p_task_id: parsed.data.taskId, p_reason: parsed.data.reason });
  return error ? dbError(error.message) : actionSuccess();
}

export async function submitCleaningAction(input: SubmitCleaningInput): Promise<ActionResult> {
  await requireSession();
  const parsed = submitCleaningSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_task_submit_cleaning", {
    p_task_id: parsed.data.taskId,
    p_items: parsed.data.items,
    p_notes: parsed.data.notes,
    p_attachment_ids: parsed.data.attachmentIds,
  });
  return error ? dbError(error.message) : actionSuccess();
}

export async function foInspectAction(input: FoInspectInput): Promise<ActionResult> {
  await requireSession();
  const parsed = foInspectSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_fo_inspect", {
    p_task_id: parsed.data.taskId,
    p_items: parsed.data.items,
    p_notes: parsed.data.notes,
    p_decision: parsed.data.decision,
    p_attachment_ids: parsed.data.attachmentIds,
  });
  return error ? dbError(error.message) : actionSuccess();
}

export async function submitSecurityAction(input: SubmitSecurityInput): Promise<ActionResult> {
  await requireSession();
  const parsed = submitSecuritySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { error } = await (await createClient()).rpc("mkc_hosp_submit_security", {
    p_department_code: d.departmentCode,
    p_kind: d.kind,
    p_items: d.items,
    p_notes: d.notes,
    p_details: d.arrivalTime ? { arrival_time: d.arrivalTime } : {},
    p_unit_id: d.unitId ?? null,
    p_severity: d.severity,
    p_attachment_ids: d.attachmentIds,
  });
  return error ? dbError(error.message) : actionSuccess();
}

export async function createIssueAction(input: CreateIssueInput): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = createIssueSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const d = parsed.data;
  const { data, error } = await (await createClient()).rpc("mkc_hosp_issue_create", {
    p_department_code: d.departmentCode,
    p_category: d.category,
    p_severity: d.severity,
    p_title: d.title,
    p_description: d.description,
    p_unit_id: d.unitId ?? null,
    p_location: d.location,
    p_action_taken: d.actionTaken,
    p_attachment_ids: d.attachmentIds,
    p_assigned_to: d.assignedTo ?? null,
  });
  return error ? dbError(error.message) : actionSuccess({ id: data as string });
}

export async function updateIssueAction(input: UpdateIssueInput): Promise<ActionResult> {
  await requireSession();
  const parsed = updateIssueSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_issue_update", {
    p_issue_id: parsed.data.issueId,
    p_action: parsed.data.action,
    p_assignee: parsed.data.assignee ?? null,
    p_note: parsed.data.note,
  });
  return error ? dbError(error.message) : actionSuccess();
}

export async function acknowledgeReportAction(input: ReportIdInput): Promise<ActionResult> {
  await requireSession();
  const parsed = reportIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_hosp_report_acknowledge", { p_report_id: parsed.data.reportId });
  return error ? dbError(error.message) : actionSuccess();
}

/**
 * "Buat laporan sekarang": owner, or the department group's manager
 * (Hospitality Manager; Kepala Cabang for Sales Jogja -- Markom has none).
 * Checked here (session + group role through RLS) because generation itself
 * runs with the service role.
 */
export async function generateReportNowAction(input: ConversationIdInput): Promise<ActionResult<{ status: string; error?: string }>> {
  const session = await requireSession();
  const parsed = conversationIdSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const conversations = await listChatConversations(await createClient());
  const conv = conversations.find((c) => c.id === parsed.data.conversationId);
  if (!conv) return actionError("Percakapan tidak ditemukan");
  const isOwner = hasPermission(session, PERMISSIONS.HOSPITALITY_OWNER_REPORT);
  const isManager = conversations.some((c) => c.departmentCode === conv.departmentCode && c.kind === "operational_group" && c.myRole === "manager");
  if (!isOwner && !isManager) return actionError("Hanya owner atau manager grup");

  const outcome = await generateManualHospitalityReport(conv.departmentCode, session.userId);
  if (outcome.status === "failed") return actionError(`Laporan gagal dibuat: ${outcome.error}`);
  return actionSuccess({ status: outcome.status });
}

export async function setRetentionHoldAction(input: RetentionHoldInput): Promise<ActionResult> {
  await requireSession();
  const parsed = retentionHoldSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await (await createClient()).rpc("mkc_chat_set_retention_hold", {
    p_attachment_id: parsed.data.attachmentId,
    p_until: parsed.data.until,
    p_reason: parsed.data.reason,
  });
  return error ? dbError(error.message) : actionSuccess();
}

export async function searchMessagesAction(
  input: SearchMessagesInput,
): Promise<ActionResult<{ id: string; body: string; createdAt: string; senderId: string | null }[]>> {
  await requireSession();
  const parsed = searchMessagesSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    return actionSuccess(await searchChatMessages(await createClient(), parsed.data.conversationId, parsed.data.term));
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Pencarian gagal");
  }
}
