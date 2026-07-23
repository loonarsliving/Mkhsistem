import { z } from "zod";

import * as announcementRepo from "@/repositories/announcement.repository";
import * as attendanceRepo from "@/repositories/attendance.repository";
import * as branchRepo from "@/repositories/branch.repository";
import * as crmRepo from "@/repositories/crm.repository";
import * as divisionRepo from "@/repositories/division.repository";
import * as employeeRepo from "@/repositories/employee.repository";
import * as memoRepo from "@/repositories/memo.repository";
import * as monitoringRepo from "@/repositories/monitoring.repository";
import * as notificationRepo from "@/repositories/notification.repository";
import * as positionRepo from "@/repositories/position.repository";
import * as searchRepo from "@/repositories/search.repository";
import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { CurrentSession } from "@/types/domain";

/**
 * Every "tool" a voice assistant (Ultron, via app/api/ai/voice-bridge) can
 * call against MK Connect. Reads are thin wrappers around the same
 * repositories the web app itself uses, so they inherit RLS scoping for
 * free. Writes are limited to the handful of RPCs that already enforce
 * their own permission + business-logic checks server-side (create_memo,
 * create_announcement, notification read-state) — nothing here bypasses
 * the rules the UI would also have to follow.
 *
 * Add a new tool by adding an entry here; app/api/ai/voice-bridge/route.ts
 * and the tool list it hands to the LLM stay in sync automatically.
 */
export interface VoiceBridgeTool<TInput = unknown, TOutput = unknown> {
  description: string;
  /** JSON Schema handed to the LLM's tool-use API — kept hand-written and separate from inputSchema so this file has no dependency on a zod-to-json-schema converter. */
  parametersSchema: Record<string, unknown>;
  inputSchema: z.ZodType<TInput>;
  handler: (supabase: TypedSupabaseClient, session: CurrentSession, input: TInput) => Promise<TOutput>;
}

const empty = z.object({}).strict().optional();
const noParams = { type: "object", properties: {}, additionalProperties: false };

export const voiceBridgeTools = {
  attendance_today: {
    description: "Status absensi hari ini milik pengguna yang sedang login.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase, session) => attendanceRepo.getTodayAttendance(supabase, session.userId),
  },
  attendance_monthly_stats: {
    description: "Rekap absensi bulanan milik pengguna yang sedang login. month opsional (YYYY-MM-DD apa saja di bulan itu), default bulan berjalan.",
    parametersSchema: { type: "object", properties: { month: { type: "string", description: "Tanggal apa saja di bulan yang dimaksud, format ISO" } }, additionalProperties: false },
    inputSchema: z.object({ month: z.string().datetime().or(z.string()).optional() }).optional(),
    handler: async (supabase, session, input) =>
      attendanceRepo.getMonthlyStats(supabase, session.userId, input?.month ? new Date(input.month) : new Date()),
  },
  attendance_company_summary: {
    description: "Ringkasan absensi seluruh perusahaan hari ini (hadir/terlambat/izin/sakit/alpha/belum absen).",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => attendanceRepo.getCompanyAttendanceSummary(supabase),
  },
  attendance_history: {
    description: "Riwayat absensi dengan filter opsional (userId, branchId, status, rentang tanggal from/to ISO date).",
    parametersSchema: {
      type: "object",
      properties: {
        userId: { type: "string", format: "uuid" },
        branchId: { type: "string", format: "uuid" },
        status: { type: "string" },
        from: { type: "string", description: "ISO date" },
        to: { type: "string", description: "ISO date" },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    inputSchema: z
      .object({
        userId: z.string().uuid().optional(),
        branchId: z.string().uuid().optional(),
        status: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(50).optional(),
      })
      .optional(),
    handler: async (supabase, _session, input) =>
      attendanceRepo.listAttendanceHistory(supabase, (input ?? {}) as attendanceRepo.AttendanceHistoryFilters),
  },
  leave_requests_pending: {
    description: "Daftar pengajuan izin/sakit yang masih menunggu persetujuan.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => attendanceRepo.listPendingLeaveRequests(supabase),
  },
  memos_recent: {
    description: "Memo terbaru yang dipublikasikan. limit opsional (default 5).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(20).optional() }).optional(),
    handler: async (supabase, _session, input) => memoRepo.listRecentMemos(supabase, input?.limit ?? 5),
  },
  memo_get: {
    description: "Detail satu memo lewat id-nya, termasuk lampiran dan target.",
    parametersSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false },
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async (supabase, _session, input) => memoRepo.getMemoById(supabase, input.id),
  },
  memo_create: {
    description:
      "Buat memo baru dan publikasikan. targets wajib diisi minimal satu, mis. [{target_type:'all'}] untuk semua karyawan, atau [{target_type:'branch', target_id:'<uuid>'}].",
    parametersSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
        isPinned: { type: "boolean" },
        isMandatoryRead: { type: "boolean" },
        expiresAt: { type: "string", description: "ISO datetime, opsional" },
        targets: {
          type: "array",
          items: { type: "object", properties: { target_type: { type: "string" }, target_id: { type: "string", format: "uuid" } }, required: ["target_type"] },
          minItems: 1,
        },
      },
      required: ["title", "content", "targets"],
      additionalProperties: false,
    },
    inputSchema: z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
      isPinned: z.boolean().default(false),
      isMandatoryRead: z.boolean().default(false),
      expiresAt: z.string().datetime().optional(),
      targets: z.array(z.object({ target_type: z.string(), target_id: z.string().uuid().optional() })).min(1),
    }),
    handler: async (supabase, _session, input) => {
      const { data, error } = await supabase.rpc("create_memo", {
        p_title: input.title,
        p_content: input.content,
        p_priority: input.priority,
        p_is_pinned: input.isPinned,
        p_is_mandatory_read: input.isMandatoryRead,
        p_expires_at: input.expiresAt ?? null,
        p_targets: input.targets,
        p_attachments: [],
      });
      if (error) throw error;
      return { id: data };
    },
  },
  announcements_recent: {
    description: "Pengumuman terbaru yang dipublikasikan. limit opsional (default 5).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 20 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(20).optional() }).optional(),
    handler: async (supabase, _session, input) => announcementRepo.listRecentAnnouncements(supabase, input?.limit ?? 5),
  },
  announcement_get: {
    description: "Detail satu pengumuman lewat id-nya.",
    parametersSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false },
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async (supabase, _session, input) => announcementRepo.getAnnouncementById(supabase, input.id),
  },
  announcement_create: {
    description:
      "Buat pengumuman baru dan publikasikan. targets wajib diisi minimal satu, mis. [{target_type:'all'}]. categoryId opsional.",
    parametersSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        content: { type: "string" },
        categoryId: { type: "string", format: "uuid" },
        isPinned: { type: "boolean" },
        expiresAt: { type: "string", description: "ISO datetime, opsional" },
        targets: {
          type: "array",
          items: { type: "object", properties: { target_type: { type: "string" }, target_id: { type: "string", format: "uuid" } }, required: ["target_type"] },
          minItems: 1,
        },
      },
      required: ["title", "content", "targets"],
      additionalProperties: false,
    },
    inputSchema: z.object({
      title: z.string().min(1),
      content: z.string().min(1),
      categoryId: z.string().uuid().optional(),
      isPinned: z.boolean().default(false),
      expiresAt: z.string().datetime().optional(),
      targets: z.array(z.object({ target_type: z.string(), target_id: z.string().uuid().optional() })).min(1),
    }),
    handler: async (supabase, _session, input) => {
      const { data, error } = await supabase.rpc("create_announcement", {
        p_title: input.title,
        p_content: input.content,
        p_category_id: input.categoryId ?? null,
        p_is_pinned: input.isPinned,
        p_expires_at: input.expiresAt ?? null,
        p_targets: input.targets,
        p_attachments: [],
      });
      if (error) throw error;
      return { id: data };
    },
  },
  employees_list: {
    description: "Cari/daftar karyawan dengan filter opsional (search, branchId, divisionId, positionId, employmentStatus).",
    parametersSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Cari berdasarkan nama, kode karyawan, atau email" },
        branchId: { type: "string", format: "uuid" },
        divisionId: { type: "string", format: "uuid" },
        positionId: { type: "string", format: "uuid" },
        employmentStatus: { type: "string" },
        page: { type: "integer", minimum: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
    inputSchema: z
      .object({
        search: z.string().optional(),
        branchId: z.string().uuid().optional(),
        divisionId: z.string().uuid().optional(),
        positionId: z.string().uuid().optional(),
        employmentStatus: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(50).optional(),
      })
      .optional(),
    handler: async (supabase, _session, input) =>
      employeeRepo.listEmployees(supabase, (input ?? {}) as employeeRepo.EmployeeListFilters),
  },
  branches_list: {
    description: "Daftar seluruh cabang perusahaan.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => branchRepo.listBranches(supabase),
  },
  divisions_list: {
    description: "Daftar seluruh divisi perusahaan.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => divisionRepo.listDivisions(supabase),
  },
  positions_list: {
    description: "Daftar seluruh jabatan perusahaan.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => positionRepo.listPositions(supabase),
  },
  notifications_list: {
    description: "Daftar notifikasi milik pengguna yang sedang login. status opsional (unread/read/archived).",
    parametersSchema: { type: "object", properties: { page: { type: "integer", minimum: 1 }, status: { type: "string", enum: ["unread", "read", "archived"] } }, additionalProperties: false },
    inputSchema: z.object({ page: z.number().int().positive().optional(), status: z.string().optional() }).optional(),
    handler: async (supabase, session, input) =>
      notificationRepo.listNotifications(supabase, session.userId, input?.page ?? 1, input?.status as never),
  },
  notifications_unread_count: {
    description: "Jumlah notifikasi belum dibaca milik pengguna yang sedang login.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase, session) => ({ count: await notificationRepo.countUnreadNotifications(supabase, session.userId) }),
  },
  notifications_mark_all_read: {
    description: "Tandai semua notifikasi milik pengguna yang sedang login sebagai sudah dibaca.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => {
      await notificationRepo.markAllNotificationsRead(supabase);
      return { ok: true };
    },
  },
  crm_prospects_list: {
    description: "Daftar prospek CRM dengan filter opsional (lihat kolom tabel prospects untuk nama field filter).",
    parametersSchema: { type: "object", additionalProperties: true },
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    handler: async (supabase, _session, input) => crmRepo.listProspects(supabase, (input ?? {}) as never),
  },
  crm_pending_payments: {
    description: "Daftar pembayaran CRM yang masih menunggu verifikasi finance.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => crmRepo.listPendingPayments(supabase),
  },
  monitoring_unresolved_errors: {
    description: "Jumlah error aplikasi yang belum diselesaikan (dari halaman Monitoring).",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => ({ count: await monitoringRepo.countUnresolvedErrors(supabase) }),
  },
  global_search: {
    description: "Cari lintas memo, pengumuman, dan karyawan sekaligus lewat satu kata kunci.",
    parametersSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    inputSchema: z.object({ query: z.string().min(1) }),
    handler: async (supabase, _session, input) => searchRepo.globalSearch(supabase, input.query),
  },
} satisfies Record<string, VoiceBridgeTool<any, unknown>>; // eslint-disable-line @typescript-eslint/no-explicit-any -- each tool's own inputSchema/handler pair is still fully typed; this widens only the map's index signature

export type VoiceBridgeToolName = keyof typeof voiceBridgeTools;

export function listToolDefinitions() {
  return Object.entries(voiceBridgeTools).map(([name, tool]) => ({
    name,
    description: tool.description,
    parametersSchema: tool.parametersSchema,
  }));
}
