import type { PermissionKey, RoleKey } from "@/constants/rbac";
import type { Tables, Views } from "@/types/database.types";

export type Employee = Tables<"employees">;
export type EmployeeDirectoryRow = Views<"v_employee_directory">;
export type Branch = Tables<"branches">;
export type Division = Tables<"divisions">;
export type Position = Tables<"positions">;
export type Role = Tables<"roles">;
export type WorkSchedule = Tables<"work_schedules">;
export type Attendance = Tables<"attendance">;
export type AttendanceTodayRow = Views<"v_attendance_today">;
export type AttendanceMonthlyStats = Views<"v_attendance_monthly_stats">;
export type LeaveRequest = Tables<"leave_requests">;
export type Memo = Tables<"memos">;
export type MemoAttachment = Tables<"memo_attachments">;
export type MemoTarget = Tables<"memo_targets">;
export type Announcement = Tables<"announcements">;
export type AnnouncementCategory = Tables<"announcement_categories">;
export type AnnouncementAttachment = Tables<"announcement_attachments">;
export type AnnouncementTarget = Tables<"announcement_targets">;
export type Notification = Tables<"mkc_notifications">;
export type CompanySettings = Tables<"company_settings">;
export type AuditLog = Tables<"audit_logs">;
export type ErrorLog = Tables<"mkc_error_logs">;
export type PerformanceMetric = Tables<"mkc_performance_metrics">;
export type PerformanceSummary = Views<"v_performance_summary">;

export type CrmProject = Tables<"crm_projects">;
export type Prospect = Tables<"prospects">;
export type ProspectFollowUp = Tables<"prospect_follow_ups">;
export type ProspectPayment = Tables<"prospect_payments">;
export type SalesTarget = Tables<"sales_targets">;
export type BranchSalesTarget = Tables<"branch_sales_targets">;

export type KpiTask = Tables<"kpi_tasks">;

export type LoonarsContentItem = Tables<"loonars_content_items">;
export type LoonarsContentMetric = Tables<"loonars_content_metrics">;
export type LoonarsOrder = Tables<"loonars_orders">;
export type LoonarsWeeklyEvaluation = Tables<"loonars_weekly_evaluations">;

export type KontenAiAssetRow = Tables<"kontenai_assets">;
export type KontenAiCreativeBriefRow = Tables<"kontenai_creative_briefs">;
export type KontenAiStoryboardRow = Tables<"kontenai_storyboards">;

/** The authenticated session shape used throughout server code and client providers. */
export interface CurrentSession {
  userId: string;
  employee: EmployeeDirectoryRow;
  roleKey: RoleKey;
  permissions: PermissionKey[];
}

export interface ActionResult<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export function actionSuccess<T>(data?: T): ActionResult<T> {
  return { success: true, data };
}

export function actionError<T = undefined>(error: string, fieldErrors?: Record<string, string[]>): ActionResult<T> {
  return { success: false, error, fieldErrors };
}
