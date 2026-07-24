import { z } from "zod";

import * as announcementRepo from "@/repositories/announcement.repository";
import * as attendanceRepo from "@/repositories/attendance.repository";
import * as branchRepo from "@/repositories/branch.repository";
import * as contentSubmissionsRepo from "@/repositories/content-submissions.repository";
import * as crmRepo from "@/repositories/crm.repository";
import * as crmPromoRepo from "@/repositories/crm-promo.repository";
import * as divisionRepo from "@/repositories/division.repository";
import * as employeeRepo from "@/repositories/employee.repository";
import * as financeBranchBalanceRepo from "@/repositories/finance-branch-balance.repository";
import * as hrFinanceRepo from "@/repositories/hr-finance.repository";
import * as kontenaiAiReportsRepo from "@/repositories/kontenai-ai-reports.repository";
import * as kontenaiAnalyticsRepo from "@/repositories/kontenai-analytics.repository";
import * as kontenaiAssetsRepo from "@/repositories/kontenai-assets.repository";
import * as kontenaiContentPerformanceRepo from "@/repositories/kontenai-content-performance.repository";
import * as kontenaiCreativeBriefsRepo from "@/repositories/kontenai-creative-briefs.repository";
import * as kontenaiOptimizationRepo from "@/repositories/kontenai-optimization.repository";
import * as kontenaiPublishSchedulesRepo from "@/repositories/kontenai-publish-schedules.repository";
import * as kontenaiRenderJobsRepo from "@/repositories/kontenai-render-jobs.repository";
import * as kontenaiStoryboardsRepo from "@/repositories/kontenai-storyboards.repository";
import * as kosOccupancyRepo from "@/repositories/kos-occupancy.repository";
import * as beautyRepo from "@/repositories/loonars-beauty.repository";
import * as markomRepo from "@/repositories/markom.repository";
import * as memoRepo from "@/repositories/memo.repository";
import * as metaAdsRepo from "@/repositories/meta-ads.repository";
import * as monitoringRepo from "@/repositories/monitoring.repository";
import * as notificationRepo from "@/repositories/notification.repository";
import * as positionRepo from "@/repositories/position.repository";
import * as searchRepo from "@/repositories/search.repository";
import * as socialRepo from "@/repositories/social.repository";
import * as workScheduleRepo from "@/repositories/work-schedule.repository";
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

  // --- Markom / audit media sosial -----------------------------------------
  social_weekly_content_audits: {
    description: "Riwayat audit konten mingguan media sosial (properti/leasehold/occupancy) yang sudah dinilai, terbaru dulu. limit opsional (default 12).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(50).optional() }).optional(),
    handler: async (supabase, _session, input) => socialRepo.listWeeklyEvaluations(supabase, input?.limit ?? 12),
  },
  social_latest_weekly_content_audit: {
    description: "Audit konten mingguan media sosial (properti) yang paling baru.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => socialRepo.getLatestWeeklyEvaluation(supabase),
  },
  social_account_snapshots: {
    description: "Snapshot metrik akun Instagram/TikTok terbaru (followers, engagement, dll).",
    parametersSchema: {
      type: "object",
      properties: {
        platform: { type: "string", enum: ["instagram", "tiktok"] },
        limit: { type: "integer", minimum: 1, maximum: 30 },
        productLine: { type: "string", enum: ["property", "beauty"] },
      },
      required: ["platform"],
      additionalProperties: false,
    },
    inputSchema: z.object({
      platform: z.enum(["instagram", "tiktok"]),
      limit: z.number().int().positive().max(30).optional(),
      productLine: z.enum(["property", "beauty"]).optional(),
    }),
    handler: async (supabase, _session, input) =>
      socialRepo.listRecentAccountSnapshots(supabase, input.platform, input.limit ?? 1, input.productLine ?? "property"),
  },
  social_competitor_accounts: {
    description: "Daftar akun kompetitor yang dipantau untuk satu fokus konten (leasehold_sales/occupancy/beauty).",
    parametersSchema: { type: "object", properties: { focus: { type: "string", enum: ["leasehold_sales", "occupancy", "beauty"] } }, required: ["focus"], additionalProperties: false },
    inputSchema: z.object({ focus: z.enum(["leasehold_sales", "occupancy", "beauty"]) }),
    handler: async (supabase, _session, input) => socialRepo.listCompetitorAccounts(supabase, input.focus),
  },
  social_competitor_content_logs: {
    description: "Log konten kompetitor yang terpantau untuk satu fokus konten, opsional per akun kompetitor.",
    parametersSchema: {
      type: "object",
      properties: {
        focus: { type: "string", enum: ["leasehold_sales", "occupancy", "beauty"] },
        competitorAccountId: { type: "string", format: "uuid" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
      },
      required: ["focus"],
      additionalProperties: false,
    },
    inputSchema: z.object({
      focus: z.enum(["leasehold_sales", "occupancy", "beauty"]),
      competitorAccountId: z.string().uuid().optional(),
      limit: z.number().int().positive().max(100).optional(),
    }),
    handler: async (supabase, _session, input) =>
      socialRepo.listCompetitorContentLogs(supabase, input.focus, input.competitorAccountId, input.limit ?? 30),
  },
  markom_kpi_tasks: {
    description: "Checklist tugas KPI tim Markom untuk satu bulan/cabang, opsional per minggu/status/fokus konten.",
    parametersSchema: {
      type: "object",
      properties: {
        branchId: { type: "string", format: "uuid" },
        periodYear: { type: "integer" },
        periodMonth: { type: "integer", minimum: 1, maximum: 12 },
        periodWeek: { type: "integer" },
        status: { type: "string", enum: ["pending", "awaiting_verification", "completed", "rejected"] },
        contentFocus: { type: "string", enum: ["leasehold_sales", "occupancy", "general"] },
      },
      required: ["periodYear", "periodMonth"],
      additionalProperties: false,
    },
    inputSchema: z.object({
      branchId: z.string().uuid().optional(),
      periodYear: z.number().int(),
      periodMonth: z.number().int().min(1).max(12),
      periodWeek: z.number().int().optional(),
      status: z.enum(["pending", "awaiting_verification", "completed", "rejected"]).optional(),
      contentFocus: z.enum(["leasehold_sales", "occupancy", "general"]).optional(),
    }),
    handler: async (supabase, _session, input) => markomRepo.listKpiTasks(supabase, input),
  },
  markom_team_employees: {
    description: "Anggota tim Markom aktif di satu cabang.",
    parametersSchema: { type: "object", properties: { branchId: { type: "string", format: "uuid" } }, required: ["branchId"], additionalProperties: false },
    inputSchema: z.object({ branchId: z.string().uuid() }),
    handler: async (supabase, _session, input) => markomRepo.listMarkomEmployees(supabase, input.branchId),
  },
  meta_ads_campaigns: {
    description: "Daftar kampanye iklan Meta (Instagram/Facebook), opsional per cabang.",
    parametersSchema: { type: "object", properties: { branchId: { type: "string", format: "uuid" } }, additionalProperties: false },
    inputSchema: z.object({ branchId: z.string().uuid().optional() }).optional(),
    handler: async (supabase, _session, input) => metaAdsRepo.listAdCampaigns(supabase, input?.branchId),
  },
  meta_ads_campaign_get: {
    description: "Detail satu kampanye iklan Meta lewat id-nya.",
    parametersSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false },
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async (supabase, _session, input) => metaAdsRepo.getAdCampaign(supabase, input.id),
  },
  content_submissions_list: {
    description: "Daftar submission konten Content Studio (video/foto) dengan filter opsional (branchId, taskId, contentFocus).",
    parametersSchema: {
      type: "object",
      properties: {
        branchId: { type: "string", format: "uuid" },
        taskId: { type: "string", format: "uuid" },
        contentFocus: { type: "string", enum: ["leasehold_sales", "occupancy", "beauty"] },
      },
      additionalProperties: false,
    },
    inputSchema: z
      .object({
        branchId: z.string().uuid().optional(),
        taskId: z.string().uuid().optional(),
        contentFocus: z.enum(["leasehold_sales", "occupancy", "beauty"]).optional(),
      })
      .optional(),
    handler: async (supabase, _session, input) => contentSubmissionsRepo.listContentSubmissions(supabase, input ?? {}),
  },
  content_submission_get: {
    description: "Detail satu submission konten Content Studio lewat id-nya.",
    parametersSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false },
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async (supabase, _session, input) => contentSubmissionsRepo.getContentSubmission(supabase, input.id),
  },

  // --- Loonars Beauty --------------------------------------------------------
  beauty_content_audits: {
    description: "Riwayat audit konten mingguan Loonars Beauty, terbaru dulu. limit opsional (default 12).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 50 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(50).optional() }).optional(),
    handler: async (supabase, _session, input) => beautyRepo.listContentAudits(supabase, input?.limit ?? 12),
  },
  beauty_latest_weekly_evaluation: {
    description: "Evaluasi mingguan Loonars Beauty yang paling baru.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => beautyRepo.getLatestWeeklyEvaluation(supabase),
  },
  beauty_content_items: {
    description: "Daftar item konten Loonars Beauty, opsional filter kategori/status.",
    parametersSchema: { type: "object", properties: { category: { type: "string" }, status: { type: "string" } }, additionalProperties: false },
    inputSchema: z.object({ category: z.string().optional(), status: z.string().optional() }).optional(),
    handler: async (supabase, _session, input) => beautyRepo.listContentItems(supabase, input as never),
  },
  beauty_orders_list: {
    description: "Daftar order Loonars Beauty dengan filter opsional (status, channel, search) dan limit (default 50).",
    parametersSchema: {
      type: "object",
      properties: { status: { type: "string" }, channel: { type: "string" }, search: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 200 } },
      additionalProperties: false,
    },
    inputSchema: z
      .object({ status: z.string().optional(), channel: z.string().optional(), search: z.string().optional(), limit: z.number().int().positive().max(200).optional() })
      .optional(),
    handler: async (supabase, _session, input) => beautyRepo.listOrders(supabase, input as never, input?.limit ?? 50),
  },
  beauty_order_stats: {
    description: "Ringkasan statistik order Loonars Beauty (jumlah, revenue, breakdown per status/channel) sejak tanggal tertentu (ISO date).",
    parametersSchema: { type: "object", properties: { sinceISODate: { type: "string" } }, required: ["sinceISODate"], additionalProperties: false },
    inputSchema: z.object({ sinceISODate: z.string() }),
    handler: async (supabase, _session, input) => beautyRepo.getOrderStats(supabase, input.sinceISODate),
  },

  // --- KontenAI ---------------------------------------------------------------
  kontenai_analytics_content: {
    description: "Baris analitik performa konten KontenAI lintas platform.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => kontenaiAnalyticsRepo.listAnalyticsContentRows(supabase),
  },
  kontenai_publish_schedule_counts: {
    description: "Jumlah jadwal publikasi KontenAI per status.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => kontenaiAnalyticsRepo.countPublishSchedules(supabase),
  },
  kontenai_content_performance: {
    description: "Data performa konten KontenAI (views, engagement, dll). limit opsional (default 100).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(200).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiContentPerformanceRepo.listKontenAiContentPerformance(supabase, input?.limit ?? 100),
  },
  kontenai_ai_reports: {
    description: "Laporan AI KontenAI (ringkasan insight otomatis). limit opsional (default 50).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(100).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiAiReportsRepo.listKontenAiAiReports(supabase, input?.limit ?? 50),
  },
  kontenai_optimization_recommendations: {
    description: "Rekomendasi optimasi konten dari KontenAI. limit opsional (default 50).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(100).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiOptimizationRepo.listKontenAiOptimizationRecommendations(supabase, input?.limit ?? 50),
  },

  // --- CRM promo, HR/finance, kos, jadwal kerja --------------------------------
  crm_promo_templates: {
    description: "Daftar template broadcast promo CRM.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => crmPromoRepo.listPromoTemplates(supabase),
  },
  crm_promo_sends: {
    description: "Riwayat pengiriman broadcast promo untuk satu template. limit opsional (default 50).",
    parametersSchema: { type: "object", properties: { templateId: { type: "string", format: "uuid" }, limit: { type: "integer", minimum: 1, maximum: 200 } }, required: ["templateId"], additionalProperties: false },
    inputSchema: z.object({ templateId: z.string().uuid(), limit: z.number().int().positive().max(200).optional() }),
    handler: async (supabase, _session, input) => crmPromoRepo.listPromoSends(supabase, input.templateId, input.limit ?? 50),
  },
  hr_finance_pending_expenses: {
    description: "Pengeluaran HR yang masih menunggu proses.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => hrFinanceRepo.listPendingHrExpenses(supabase),
  },
  hr_finance_draft_payroll: {
    description: "Payroll run yang masih berstatus draft.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => hrFinanceRepo.listDraftPayrollRuns(supabase),
  },
  hr_finance_active_employees: {
    description: "Daftar karyawan aktif untuk keperluan HR/finance sync.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => hrFinanceRepo.listActiveEmployees(supabase),
  },
  hr_finance_sync_log: {
    description: "Log sinkronisasi HR/finance terbaru.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => hrFinanceRepo.listRecentSyncLog(supabase),
  },
  finance_branch_balances: {
    description: "Saldo keuangan seluruh cabang.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => financeBranchBalanceRepo.listBranchBalances(supabase),
  },
  finance_branch_balance_get: {
    description: "Saldo keuangan satu cabang lewat id-nya.",
    parametersSchema: { type: "object", properties: { branchId: { type: "string", format: "uuid" } }, required: ["branchId"], additionalProperties: false },
    inputSchema: z.object({ branchId: z.string().uuid() }),
    handler: async (supabase, _session, input) => financeBranchBalanceRepo.getBranchBalance(supabase, input.branchId),
  },
  kos_occupancy: {
    description: "Data okupansi properti Kos/Management Property.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => kosOccupancyRepo.getKosOccupancy(supabase),
  },
  work_schedules_list: {
    description: "Daftar jadwal kerja (jam masuk/pulang) yang berlaku.",
    parametersSchema: noParams,
    inputSchema: empty,
    handler: async (supabase) => workScheduleRepo.listWorkSchedules(supabase),
  },

  // --- Pengetahuan yang dipelajari/dihasilkan AI (KontenAI) --------------------
  kontenai_asset_library: {
    description:
      "Asset library KontenAI yang sudah dianalisis AI (vision: deskripsi, tag, mood, dll). limit opsional (default 300).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 500 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(500).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiAssetsRepo.listAnalyzedAssetLibrary(supabase, input?.limit ?? 300),
  },
  kontenai_assets_search: {
    description: "Cari/daftar asset KontenAI mentah dengan filter (search, assetType, company, project, campaign, platform, contentType, status, tags, dll).",
    parametersSchema: { type: "object", additionalProperties: true },
    inputSchema: z.record(z.string(), z.unknown()).optional(),
    handler: async (supabase, _session, input) => kontenaiAssetsRepo.listKontenAiAssets(supabase, (input ?? {}) as never),
  },
  kontenai_creative_briefs: {
    description: "Riwayat Creative Brief yang dihasilkan AI Director KontenAI, terbaru dulu. limit opsional (default 50).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(100).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiCreativeBriefsRepo.listKontenAiCreativeBriefs(supabase, input?.limit ?? 50),
  },
  kontenai_creative_brief_get: {
    description: "Detail satu Creative Brief KontenAI lewat id-nya.",
    parametersSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false },
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async (supabase, _session, input) => kontenaiCreativeBriefsRepo.getKontenAiCreativeBrief(supabase, input.id),
  },
  kontenai_storyboards: {
    description: "Daftar Storyboard (rangkaian scene) yang dihasilkan AI KontenAI, terbaru dulu. limit opsional (default 50).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(100).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiStoryboardsRepo.listKontenAiStoryboards(supabase, input?.limit ?? 50),
  },
  kontenai_storyboard_get: {
    description: "Detail satu Storyboard KontenAI lewat id-nya, termasuk scene dan asset yang dicocokkan.",
    parametersSchema: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"], additionalProperties: false },
    inputSchema: z.object({ id: z.string().uuid() }),
    handler: async (supabase, _session, input) => kontenaiStoryboardsRepo.getKontenAiStoryboard(supabase, input.id),
  },
  kontenai_render_jobs: {
    description: "Daftar render job video KontenAI (status render), terbaru dulu. limit opsional (default 50).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 100 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(100).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiRenderJobsRepo.listKontenAiRenderJobs(supabase, input?.limit ?? 50),
  },
  kontenai_publish_schedules: {
    description: "Daftar jadwal publikasi konten KontenAI beserta hasilnya, terbaru dulu. limit opsional (default 100).",
    parametersSchema: { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 200 } }, additionalProperties: false },
    inputSchema: z.object({ limit: z.number().int().positive().max(200).optional() }).optional(),
    handler: async (supabase, _session, input) => kontenaiPublishSchedulesRepo.listKontenAiPublishSchedules(supabase, input?.limit ?? 100),
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
