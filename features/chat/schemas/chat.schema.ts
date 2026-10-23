import { z } from "zod";

import {
  EVIDENCE_SLOTS,
  FO_DECISIONS,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  SECURITY_KINDS,
} from "@/lib/hospitality/checklists";

const uuid = z.string().uuid();
const attachmentIds = z.array(uuid).max(12).default([]);
const items = z.record(z.string().regex(/^[a-z_]+$/), z.boolean());
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const conversationIdSchema = z.object({ conversationId: uuid });
export type ConversationIdInput = z.input<typeof conversationIdSchema>;

export const loadMessagesSchema = z.object({ conversationId: uuid, before: z.string().datetime({ offset: true }).optional() });
export type LoadMessagesInput = z.input<typeof loadMessagesSchema>;

export const sendTextSchema = z
  .object({ conversationId: uuid, body: z.string().trim().max(4000), attachmentIds })
  .refine((v) => v.body.length > 0 || v.attachmentIds.length > 0, { message: "Pesan kosong", path: ["body"] });
export type SendTextInput = z.input<typeof sendTextSchema>;

export const registerAttachmentSchema = z.object({
  conversationId: uuid,
  objectPath: z.string().min(10).max(300),
  evidenceSlot: z.enum(EVIDENCE_SLOTS).optional(),
});
export type RegisterAttachmentInput = z.input<typeof registerAttachmentSchema>;

export const taskIdSchema = z.object({ taskId: uuid });
export type TaskIdInput = z.input<typeof taskIdSchema>;

export const assignTaskSchema = z.object({ taskId: uuid, employeeId: uuid });
export type AssignTaskInput = z.input<typeof assignTaskSchema>;

export const blockTaskSchema = z.object({ taskId: uuid, reason: z.string().trim().min(3, "Tulis kendalanya").max(500) });
export type BlockTaskInput = z.input<typeof blockTaskSchema>;

export const submitCleaningSchema = z.object({ taskId: uuid, items, notes: optionalText(2000), attachmentIds });
export type SubmitCleaningInput = z.input<typeof submitCleaningSchema>;

export const foInspectSchema = z.object({
  taskId: uuid,
  items,
  notes: optionalText(2000),
  decision: z.enum(FO_DECISIONS),
  attachmentIds,
});
export type FoInspectInput = z.input<typeof foInspectSchema>;

export const submitSecuritySchema = z.object({
  departmentCode: z.string().regex(/^[a-z_]+$/),
  kind: z.enum(SECURITY_KINDS),
  items,
  notes: optionalText(2000),
  unitId: uuid.optional(),
  arrivalTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .optional(),
  severity: z.enum(ISSUE_SEVERITIES).default("medium"),
  attachmentIds,
});
export type SubmitSecurityInput = z.input<typeof submitSecuritySchema>;

export const createIssueSchema = z.object({
  departmentCode: z.string().regex(/^[a-z_]+$/),
  category: z.enum(ISSUE_CATEGORIES),
  severity: z.enum(ISSUE_SEVERITIES),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(200),
  description: z.string().trim().min(3, "Jelaskan kejadiannya").max(4000),
  unitId: uuid.optional(),
  location: optionalText(200),
  actionTaken: optionalText(2000),
  assignedTo: uuid.optional(),
  attachmentIds,
});
export type CreateIssueInput = z.input<typeof createIssueSchema>;

export const updateIssueSchema = z
  .object({
    issueId: uuid,
    action: z.enum(["assign", "start", "resolve", "cancel", "note"]),
    assignee: uuid.optional(),
    note: optionalText(2000),
  })
  .refine((v) => v.action !== "assign" || !!v.assignee, { message: "Pilih penanggung jawab", path: ["assignee"] })
  .refine((v) => !["resolve", "cancel", "note"].includes(v.action) || !!v.note, { message: "Tulis catatannya", path: ["note"] });
export type UpdateIssueInput = z.input<typeof updateIssueSchema>;

export const reportIdSchema = z.object({ reportId: uuid });
export type ReportIdInput = z.input<typeof reportIdSchema>;

export const retentionHoldSchema = z.object({
  attachmentId: uuid,
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z.string().trim().min(10, "Alasan minimal 10 karakter").max(500),
});
export type RetentionHoldInput = z.input<typeof retentionHoldSchema>;

export const searchMessagesSchema = z.object({ conversationId: uuid, term: z.string().trim().min(2).max(100) });
export type SearchMessagesInput = z.input<typeof searchMessagesSchema>;
