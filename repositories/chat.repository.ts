import type { TypedSupabaseClient } from "@/lib/supabase/types";

import { CONNECT_REF_TABLES, EMPTY_CONNECT_REFS, loadConnectRefs, type ConnectRefs, type ConnectRefTable } from "./connect.repository";

/**
 * Reads for Loonars Connect chat (/chat, migration 0291). Pure queries under
 * the caller's own session: RLS (membership for the operational group,
 * hospitality.owner_report for the owner feed) decides what comes back.
 * Structured cards are returned with the LIVE state of the record they
 * point at, so a card can never claim "resolved" while its record isn't.
 */

export const EVIDENCE_BUCKET = "hospitality-evidence";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

export interface ChatConversation {
  id: string;
  kind: "operational_group" | "owner_feed" | "direct";
  name: string;
  description: string | null;
  departmentCode: string;
  departmentName: string;
  myRole: string | null;
  memberCount: number;
  lastAt: string | null;
  lastBody: string | null;
  lastKind: string | null;
  lastSender: string | null;
  unread: number;
  /** direct chats (0300): the other person */
  peerId: string | null;
}

/** Someone the caller can start a direct chat with (0300). */
export interface ChatContact {
  id: string;
  name: string;
  branch: string | null;
  position: string | null;
  conversationId: string | null;
}

export interface ChatPerson {
  id: string;
  name: string;
  role: string | null;
  active: boolean;
}

export interface ChatAttachment {
  id: string;
  evidenceSlot: string | null;
  mimeType: string | null;
  uploadedAt: string;
  expiresAt: string;
  retentionHoldUntil: string | null;
  /** null once the file is deleted by retention (or the link could not be signed) */
  url: string | null;
  deleted: boolean;
}

export interface RoomTaskRef {
  id: string;
  unitNomor: string;
  unitId: string | null;
  status: string;
  assignedTo: string | null;
  targetAt: string | null;
  completionSource: string | null;
  conflictNote: string | null;
  blockedReason: string | null;
  reworkCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface IssueRef {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  unitNomor: string | null;
  location: string | null;
  assignedTo: string | null;
  reporterId: string;
  targetAt: string | null;
  resolutionNotes: string | null;
  cancelReason: string | null;
  actionTaken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistRef {
  id: string;
  kind: string;
  unitNomor: string | null;
  items: Record<string, boolean>;
  notes: string | null;
  result: string;
  decision: string | null;
  details: Record<string, unknown>;
  submittedBy: string;
  submittedAt: string;
  roomTaskId: string | null;
}

export interface ReportRef {
  id: string;
  periodKind: string;
  reportDate: string;
  status: string;
  data: unknown;
  error: string | null;
  generatedAt: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  kind: string;
  body: string;
  refTable: "room_task" | "issue" | "checklist" | "report" | ConnectRefTable | null;
  refId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  attachments: ChatAttachment[];
  /** 0301: the message this one replies to (live from its row), or null */
  replyTo: ChatReplyRef | null;
}

/** Quoted original of a reply; its own row may sit outside the loaded page. */
export interface ChatReplyRef {
  id: string;
  senderId: string | null;
  body: string;
  hasPhoto: boolean;
}

export interface ChatRefs {
  tasks: Record<string, RoomTaskRef>;
  issues: Record<string, IssueRef>;
  checklists: Record<string, ChecklistRef>;
  reports: Record<string, ReportRef>;
  /** Markom / Sales records (0294) */
  connect: ConnectRefs;
}

export interface ChatUnit {
  id: string;
  nomor: string;
  status: string;
}

export async function listChatConversations(supabase: TypedSupabaseClient): Promise<ChatConversation[]> {
  const { data, error } = await supabase.rpc("mkc_chat_list");
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: String(r.id),
    kind: r.kind as ChatConversation["kind"],
    name: String(r.name),
    description: (r.description as string | null) ?? null,
    departmentCode: String(r.department_code),
    departmentName: String(r.department_name),
    myRole: (r.my_role as string | null) ?? null,
    memberCount: Number(r.member_count ?? 0),
    lastAt: (r.last_at as string | null) ?? null,
    lastBody: (r.last_body as string | null) ?? null,
    lastKind: (r.last_kind as string | null) ?? null,
    lastSender: (r.last_sender as string | null) ?? null,
    unread: Number(r.unread ?? 0),
    peerId: (r.peer_id as string | null) ?? null,
  }));
}

export async function listDirectContacts(supabase: TypedSupabaseClient): Promise<ChatContact[]> {
  const { data, error } = await supabase.rpc("mkc_chat_direct_contacts");
  if (error) throw new Error(error.message);
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    branch: (r.branch as string | null) ?? null,
    position: (r.position as string | null) ?? null,
    conversationId: (r.conversation_id as string | null) ?? null,
  }));
}

export async function listChatPeople(supabase: TypedSupabaseClient, departmentCode: string): Promise<ChatPerson[]> {
  const { data, error } = await supabase.rpc("mkc_hosp_people", { p_department_code: departmentCode });
  if (error) throw new Error(error.message);
  return ((data as ChatPerson[] | null) ?? []).map((p) => ({ id: p.id, name: p.name, role: p.role ?? null, active: !!p.active }));
}

export async function listChatUnits(supabase: TypedSupabaseClient, departmentCode: string): Promise<ChatUnit[]> {
  const { data, error } = await supabase.rpc("mkc_hosp_units", { p_department_code: departmentCode });
  if (error) throw new Error(error.message);
  return (data as ChatUnit[] | null) ?? [];
}

type TaskRow = {
  id: string;
  unit_nomor: string;
  unit_id: string | null;
  status: string;
  assigned_to: string | null;
  target_at: string | null;
  completion_source: string | null;
  conflict_note: string | null;
  blocked_reason: string | null;
  rework_count: number;
  created_at: string;
  updated_at: string;
};

function mapTask(t: TaskRow): RoomTaskRef {
  return {
    id: t.id,
    unitNomor: t.unit_nomor,
    unitId: t.unit_id,
    status: t.status,
    assignedTo: t.assigned_to,
    targetAt: t.target_at,
    completionSource: t.completion_source,
    conflictNote: t.conflict_note,
    blockedReason: t.blocked_reason,
    reworkCount: t.rework_count,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  };
}

const TASK_COLS =
  "id, unit_nomor, unit_id, status, assigned_to, target_at, completion_source, conflict_note, blocked_reason, rework_count, created_at, updated_at";
const ISSUE_COLS =
  "id, code, title, description, category, severity, status, unit_nomor, location, assigned_to, reporter_id, target_at, resolution_notes, cancel_reason, action_taken, created_at, updated_at";

type IssueRow = {
  id: string;
  code: string;
  title: string;
  description: string;
  category: string;
  severity: string;
  status: string;
  unit_nomor: string | null;
  location: string | null;
  assigned_to: string | null;
  reporter_id: string;
  target_at: string | null;
  resolution_notes: string | null;
  cancel_reason: string | null;
  action_taken: string | null;
  created_at: string;
  updated_at: string;
};

function mapIssue(i: IssueRow): IssueRef {
  return {
    id: i.id,
    code: i.code,
    title: i.title,
    description: i.description,
    category: i.category,
    severity: i.severity,
    status: i.status,
    unitNomor: i.unit_nomor,
    location: i.location,
    assignedTo: i.assigned_to,
    reporterId: i.reporter_id,
    targetAt: i.target_at,
    resolutionNotes: i.resolution_notes,
    cancelReason: i.cancel_reason,
    actionTaken: i.action_taken,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  };
}

/** Open room tasks + open issues of a department -- the "what is outstanding" panel. */
export async function listOpenWork(
  supabase: TypedSupabaseClient,
  departmentId: string,
): Promise<{ tasks: RoomTaskRef[]; issues: IssueRef[] }> {
  const [tasks, issues] = await Promise.all([
    supabase
      .from("mkc_hosp_room_tasks")
      .select(TASK_COLS)
      .eq("department_id", departmentId)
      .not("status", "in", "(completed,cancelled)")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("mkc_hosp_issues")
      .select(ISSUE_COLS)
      .eq("department_id", departmentId)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: true })
      .limit(100),
  ]);
  if (tasks.error) throw new Error(tasks.error.message);
  if (issues.error) throw new Error(issues.error.message);
  return { tasks: (tasks.data as TaskRow[]).map(mapTask), issues: (issues.data as IssueRow[]).map(mapIssue) };
}

async function signAttachments(
  supabase: TypedSupabaseClient,
  rows: {
    id: string;
    message_id: string | null;
    evidence_slot: string | null;
    mime_type: string | null;
    uploaded_at: string;
    expires_at: string;
    retention_hold_until: string | null;
    object_path: string;
    deleted_at: string | null;
  }[],
): Promise<Map<string, ChatAttachment[]>> {
  const live = rows.filter((r) => !r.deleted_at);
  const urls = new Map<string, string>();
  if (live.length > 0) {
    const { data } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrls(
      live.map((r) => r.object_path),
      SIGNED_URL_TTL_SECONDS,
    );
    for (const s of data ?? []) if (s.signedUrl && s.path) urls.set(s.path, s.signedUrl);
  }
  const byMessage = new Map<string, ChatAttachment[]>();
  for (const r of rows) {
    if (!r.message_id) continue;
    const list = byMessage.get(r.message_id) ?? [];
    list.push({
      id: r.id,
      evidenceSlot: r.evidence_slot,
      mimeType: r.mime_type,
      uploadedAt: r.uploaded_at,
      expiresAt: r.expires_at,
      retentionHoldUntil: r.retention_hold_until,
      url: r.deleted_at ? null : (urls.get(r.object_path) ?? null),
      deleted: !!r.deleted_at,
    });
    byMessage.set(r.message_id, list);
  }
  return byMessage;
}

/** Newest `limit` messages (older than `before` when paging back), oldest first, with live card refs. */
export async function listChatMessages(
  supabase: TypedSupabaseClient,
  conversationId: string,
  options: { before?: string; limit?: number } = {},
): Promise<{ messages: ChatMessage[]; refs: ChatRefs; hasMore: boolean }> {
  const limit = Math.min(options.limit ?? 50, 100);
  let query = supabase
    .from("mkc_chat_messages")
    .select("id, conversation_id, sender_id, kind, body, ref_table, ref_id, payload, created_at, reply_to_id")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);
  if (options.before) query = query.lt("created_at", options.before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  const ids = page.map((m) => m.id);

  const refIds = (table: string) => [...new Set(page.filter((m) => m.ref_table === table && m.ref_id).map((m) => m.ref_id as string))];
  const taskIds = refIds("room_task");
  const issueIds = refIds("issue");
  const checklistIds = refIds("checklist");
  const reportIds = refIds("report");

  const [attachments, tasks, issues, checklists, reports] = await Promise.all([
    ids.length
      ? supabase
          .from("mkc_chat_attachments")
          .select("id, message_id, evidence_slot, mime_type, uploaded_at, expires_at, retention_hold_until, object_path, deleted_at")
          .in("message_id", ids)
      : Promise.resolve({ data: [], error: null }),
    taskIds.length ? supabase.from("mkc_hosp_room_tasks").select(TASK_COLS).in("id", taskIds) : Promise.resolve({ data: [], error: null }),
    issueIds.length ? supabase.from("mkc_hosp_issues").select(ISSUE_COLS).in("id", issueIds) : Promise.resolve({ data: [], error: null }),
    checklistIds.length
      ? supabase
          .from("mkc_hosp_checklists")
          .select("id, kind, unit_nomor, items, notes, result, decision, details, submitted_by, submitted_at, room_task_id")
          .in("id", checklistIds)
      : Promise.resolve({ data: [], error: null }),
    reportIds.length
      ? supabase
          .from("mkc_hosp_reports")
          .select("id, period_kind, report_date, status, data, error, generated_at, acknowledged_by, acknowledged_at")
          .in("id", reportIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [attachments, tasks, issues, checklists, reports]) if (r.error) throw new Error(r.error.message);

  const connectIds: Partial<Record<ConnectRefTable, string[]>> = {};
  for (const t of CONNECT_REF_TABLES) {
    const list = refIds(t);
    if (list.length) connectIds[t] = list;
  }
  let connect: ConnectRefs = EMPTY_CONNECT_REFS;
  if (Object.keys(connectIds).length) {
    const dept = await getConversationDepartment(supabase, conversationId);
    if (dept) connect = await loadConnectRefs(supabase, dept.code, connectIds);
  }

  const attByMessage = await signAttachments(supabase, (attachments.data ?? []) as Parameters<typeof signAttachments>[1]);

  // Quoted originals (0301): taken from this page when loaded, else fetched (RLS: same conversation only).
  const replyRefs = new Map<string, ChatReplyRef>();
  for (const m of page) replyRefs.set(m.id, { id: m.id, senderId: m.sender_id, body: m.body, hasPhoto: (attByMessage.get(m.id) ?? []).length > 0 });
  const missingReplyIds = [...new Set(page.map((m) => m.reply_to_id).filter((id): id is string => !!id && !replyRefs.has(id)))];
  if (missingReplyIds.length) {
    const [originals, originalPhotos] = await Promise.all([
      supabase.from("mkc_chat_messages").select("id, sender_id, body").in("id", missingReplyIds),
      supabase.from("mkc_chat_attachments").select("message_id").in("message_id", missingReplyIds),
    ]);
    if (originals.error) throw new Error(originals.error.message);
    const withPhoto = new Set((originalPhotos.data ?? []).map((a) => a.message_id));
    for (const o of originals.data ?? []) replyRefs.set(o.id, { id: o.id, senderId: o.sender_id, body: o.body, hasPhoto: withPhoto.has(o.id) });
  }

  const refs: ChatRefs = { tasks: {}, issues: {}, checklists: {}, reports: {}, connect };
  for (const t of (tasks.data ?? []) as TaskRow[]) refs.tasks[t.id] = mapTask(t);
  for (const i of (issues.data ?? []) as IssueRow[]) refs.issues[i.id] = mapIssue(i);
  for (const c of (checklists.data ?? []) as {
    id: string;
    kind: string;
    unit_nomor: string | null;
    items: Record<string, boolean>;
    notes: string | null;
    result: string;
    decision: string | null;
    details: Record<string, unknown>;
    submitted_by: string;
    submitted_at: string;
    room_task_id: string | null;
  }[]) {
    refs.checklists[c.id] = {
      id: c.id,
      kind: c.kind,
      unitNomor: c.unit_nomor,
      items: c.items ?? {},
      notes: c.notes,
      result: c.result,
      decision: c.decision,
      details: c.details ?? {},
      submittedBy: c.submitted_by,
      submittedAt: c.submitted_at,
      roomTaskId: c.room_task_id,
    };
  }
  for (const r of (reports.data ?? []) as {
    id: string;
    period_kind: string;
    report_date: string;
    status: string;
    data: unknown;
    error: string | null;
    generated_at: string | null;
    acknowledged_by: string | null;
    acknowledged_at: string | null;
  }[]) {
    refs.reports[r.id] = {
      id: r.id,
      periodKind: r.period_kind,
      reportDate: r.report_date,
      status: r.status,
      data: r.data,
      error: r.error,
      generatedAt: r.generated_at,
      acknowledgedBy: r.acknowledged_by,
      acknowledgedAt: r.acknowledged_at,
    };
  }

  return {
    messages: page.map((m) => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      kind: m.kind,
      body: m.body,
      refTable: m.ref_table as ChatMessage["refTable"],
      refId: m.ref_id,
      payload: (m.payload as Record<string, unknown>) ?? {},
      createdAt: m.created_at,
      attachments: attByMessage.get(m.id) ?? [],
      replyTo: m.reply_to_id ? (replyRefs.get(m.reply_to_id) ?? null) : null,
    })),
    refs,
    hasMore,
  };
}

export async function getDepartmentId(supabase: TypedSupabaseClient, conversationId: string): Promise<string | null> {
  const { data } = await supabase.from("mkc_chat_conversations").select("department_id").eq("id", conversationId).maybeSingle();
  return data?.department_id ?? null;
}

export async function getConversationDepartment(
  supabase: TypedSupabaseClient,
  conversationId: string,
): Promise<{ id: string; code: string; timezone: string } | null> {
  const departmentId = await getDepartmentId(supabase, conversationId);
  if (!departmentId) return null;
  const { data } = await supabase.from("mkc_chat_departments").select("id, code, timezone").eq("id", departmentId).maybeSingle();
  return data ?? null;
}

/** Search message text in one conversation (RLS-scoped), newest first. */
export async function searchChatMessages(
  supabase: TypedSupabaseClient,
  conversationId: string,
  term: string,
): Promise<{ id: string; body: string; createdAt: string; senderId: string | null }[]> {
  const cleaned = term.replace(/[%_\\]/g, "").trim();
  if (cleaned.length < 2) return [];
  const { data, error } = await supabase
    .from("mkc_chat_messages")
    .select("id, body, created_at, sender_id")
    .eq("conversation_id", conversationId)
    .ilike("body", `%${cleaned}%`)
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({ id: m.id, body: m.body, createdAt: m.created_at, senderId: m.sender_id }));
}
