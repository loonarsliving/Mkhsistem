import { z } from "zod";

import { FOLLOW_UP_ACTIVITY_TYPE, LEAD_SOURCE } from "@/constants/app";
import {
  CONTENT_ACTIONS,
  CONTENT_FORMATS,
  CONTENT_PLATFORMS,
  CONTENT_TOPICS,
  INTEREST_LEVELS,
  KOL_COMPENSATIONS,
  KOL_DELIVERABLES,
  KOL_PLATFORMS,
  VISIT_OUTCOMES,
} from "@/lib/connect/labels";
import { SALES_DAILY_ITEMS } from "@/lib/connect/sales-report";

/** Inputs for the Markom Jogja / Sales Jogja group actions (0294). The RPCs re-check everything. */

const uuid = z.string().uuid();
const departmentCode = z.string().regex(/^[a-z_]+$/);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid");
const url = z.string().trim().regex(/^https?:\/\/\S+$/i, "Masukkan link lengkap (https://…)").max(500);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

// ---- Markom ----
export const createContentSchema = z.object({
  departmentCode,
  plannedDate: isoDate,
  platform: z.enum(CONTENT_PLATFORMS),
  format: z.enum(CONTENT_FORMATS),
  topic: z.enum(CONTENT_TOPICS),
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(200),
  brief: optionalText(2000),
  picId: uuid.optional(),
  kolId: uuid.optional(),
});
export type CreateContentInput = z.input<typeof createContentSchema>;

export const updateContentSchema = z
  .object({
    id: uuid,
    action: z.enum(CONTENT_ACTIONS),
    date: isoDate.optional(),
    url: url.optional(),
    picId: uuid.optional(),
    note: optionalText(1000),
  })
  .refine((v) => v.action !== "publish" || !!v.url, { message: "Masukkan link konten yang sudah tayang", path: ["url"] })
  .refine((v) => v.action !== "reschedule" || !!v.date, { message: "Pilih tanggal baru", path: ["date"] })
  .refine((v) => v.action !== "reassign" || !!v.picId, { message: "Pilih PIC", path: ["picId"] })
  .refine((v) => v.action !== "cancel" || !!v.note, { message: "Tulis alasan pembatalan", path: ["note"] });
export type UpdateContentInput = z.input<typeof updateContentSchema>;

export const createKolSchema = z.object({
  departmentCode,
  kolHandle: z.string().trim().min(2, "Isi akun KOL").max(80),
  platform: z.enum(KOL_PLATFORMS),
  followers: z.coerce.number().int().min(0).max(100_000_000).optional(),
  niche: optionalText(100),
  compensation: z.enum(KOL_COMPENSATIONS),
  requestedCheckin: isoDate,
  nights: z.coerce.number().int().min(1, "Minimal 1 malam").max(7, "Maksimal 7 malam"),
  deliverables: z.array(z.enum(KOL_DELIVERABLES)).min(1, "Pilih minimal satu kewajiban konten"),
  notes: optionalText(2000),
});
export type CreateKolInput = z.input<typeof createKolSchema>;

export const decideKolSchema = z
  .object({
    kolId: uuid,
    decision: z.enum(["approve", "reject"]),
    unitId: uuid.optional(),
    checkin: isoDate.optional(),
    nights: z.coerce.number().int().min(1).max(7).optional(),
    note: optionalText(1000),
  })
  .refine((v) => v.decision !== "approve" || (!!v.unitId && !!v.checkin && !!v.nights), { message: "Pilih unit, tanggal dan jumlah malam", path: ["unitId"] })
  .refine((v) => v.decision !== "reject" || !!v.note, { message: "Tulis alasan penolakan", path: ["note"] });
export type DecideKolInput = z.input<typeof decideKolSchema>;

export const updateKolSchema = z
  .object({
    kolId: uuid,
    action: z.enum(["deliverable", "cancel", "note"]),
    key: z.enum(KOL_DELIVERABLES).optional(),
    url: url.optional(),
    note: optionalText(1000),
  })
  .refine((v) => v.action !== "deliverable" || (!!v.key && !!v.url), { message: "Pilih kewajiban dan isi link-nya", path: ["url"] })
  .refine((v) => v.action === "deliverable" || !!v.note, { message: "Tulis catatannya", path: ["note"] });
export type UpdateKolInput = z.input<typeof updateKolSchema>;

// ---- Sales ----
export const createLeadSchema = z.object({
  departmentCode,
  customerName: z.string().trim().min(2, "Nama pelanggan wajib diisi").max(200),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{8,20}$/, "Nomor telepon tidak valid"),
  houseType: z.string().trim().min(1, "Tipe rumah wajib diisi").max(100),
  city: z.string().trim().min(1, "Kota wajib diisi").max(100),
  leadSource: z.enum(Object.values(LEAD_SOURCE) as [string, ...string[]]),
  notes: optionalText(2000),
});
export type CreateLeadInput = z.input<typeof createLeadSchema>;

export const salesFollowUpSchema = z.object({
  departmentCode,
  prospectId: uuid,
  activityType: z.enum(Object.values(FOLLOW_UP_ACTIVITY_TYPE) as [string, ...string[]]),
  notes: z.string().trim().min(3, "Tulis hasil follow-up").max(2000),
});
export type SalesFollowUpInput = z.input<typeof salesFollowUpSchema>;

export const scheduleVisitSchema = z.object({
  departmentCode,
  prospectId: uuid,
  scheduledAt: z.string().datetime({ offset: true }),
  note: optionalText(1000),
});
export type ScheduleVisitInput = z.input<typeof scheduleVisitSchema>;

export const visitResultSchema = z
  .object({
    visitId: uuid,
    outcome: z.enum(VISIT_OUTCOMES),
    interest: z.enum(INTEREST_LEVELS).optional(),
    note: optionalText(2000),
  })
  .refine((v) => v.outcome !== "done" || !!v.note, { message: "Tulis hasil kunjungannya", path: ["note"] });
export type VisitResultInput = z.input<typeof visitResultSchema>;

const dailyKeys = SALES_DAILY_ITEMS.map((i) => i.key) as [string, ...string[]];
export const dailyReportSchema = z.object({
  departmentCode,
  items: z.record(z.enum(dailyKeys), z.boolean()).refine((v) => dailyKeys.every((k) => typeof v[k] === "boolean"), "Isi semua poin"),
  followUps: z.coerce.number().int().min(0).max(500),
  visits: z.coerce.number().int().min(0).max(100),
  hot: z.coerce.number().int().min(0).max(500),
  notes: optionalText(2000),
});
export type DailyReportInput = z.input<typeof dailyReportSchema>;
