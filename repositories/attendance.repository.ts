import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { AttendanceStatus } from "@/constants/app";
import {
  DEFAULT_COMPANY_TIMEZONE,
  OPEN_SHIFT_MAX_HOURS,
  localDate,
  pickCurrentAttendance,
} from "@/lib/attendance/current-shift";
import type { Attendance } from "@/types/domain";

export type CurrentAttendance = Attendance & { carried_over: boolean };

export async function getCompanyTimezone(supabase: TypedSupabaseClient): Promise<string> {
  const { data } = await supabase.from("company_settings").select("timezone").limit(1).maybeSingle();
  return data?.timezone || DEFAULT_COMPANY_TIMEZONE;
}

/**
 * The attendance row the user acts on right now: today's row (company-local
 * date, not UTC) or a still-open shift from the previous night. See
 * lib/attendance/current-shift.ts for the rule.
 */
export async function getTodayAttendance(supabase: TypedSupabaseClient, userId: string): Promise<CurrentAttendance | null> {
  const now = new Date();
  const timezone = await getCompanyTimezone(supabase);
  const today = localDate(now, timezone);
  const since = new Date(now.getTime() - OPEN_SHIFT_MAX_HOURS * 3_600_000).toISOString();

  const [todayRes, openRes] = await Promise.all([
    supabase.from("attendance").select("*").eq("user_id", userId).eq("attendance_date", today).maybeSingle(),
    supabase
      .from("attendance")
      .select("*")
      .eq("user_id", userId)
      .lt("attendance_date", today)
      .not("check_in_time", "is", null)
      .is("check_out_time", null)
      .is("deleted_at", null)
      .gte("check_in_time", since)
      .order("check_in_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (todayRes.error) throw todayRes.error;
  if (openRes.error) throw openRes.error;

  return pickCurrentAttendance(todayRes.data, openRes.data, today, now);
}

export async function getMonthlyStats(supabase: TypedSupabaseClient, userId: string, month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("v_attendance_monthly_stats")
    .select("*")
    .eq("user_id", userId)
    .eq("month", monthStart)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface AttendanceHistoryFilters {
  userId?: string;
  branchId?: string;
  status?: AttendanceStatus;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listAttendanceHistory(supabase: TypedSupabaseClient, filters: AttendanceHistoryFilters) {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 10;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("attendance")
    .select("*, employees:user_id(full_name, avatar_url, employee_code)", { count: "exact" })
    .is("deleted_at", null)
    .order("attendance_date", { ascending: false })
    .range(from, to);

  if (filters.userId) query = query.eq("user_id", filters.userId);
  if (filters.branchId) query = query.eq("branch_id", filters.branchId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.from) query = query.gte("attendance_date", filters.from);
  if (filters.to) query = query.lte("attendance_date", filters.to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { items: data ?? [], total: count ?? 0 };
}

export async function getBranchTodaySummary(supabase: TypedSupabaseClient, branchId?: string) {
  let query = supabase.from("v_attendance_today").select("*");
  if (branchId) query = query.eq("branch_id", branchId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export interface CompanyAttendanceSummary {
  hadir: number;
  terlambat: number;
  izin: number;
  sakit: number;
  alpha: number;
  belumAbsen: number;
  total: number;
}

/** Today's company-wide attendance rollup for the Executive Dashboard's Attendance Summary widget. */
export async function getCompanyAttendanceSummary(supabase: TypedSupabaseClient): Promise<CompanyAttendanceSummary> {
  const rows = await getBranchTodaySummary(supabase);
  const summary: CompanyAttendanceSummary = { hadir: 0, terlambat: 0, izin: 0, sakit: 0, alpha: 0, belumAbsen: 0, total: rows.length };
  for (const row of rows) {
    if (row.status === "hadir") summary.hadir++;
    else if (row.status === "terlambat") summary.terlambat++;
    else if (row.status === "izin") summary.izin++;
    else if (row.status === "sakit") summary.sakit++;
    else if (row.status === "alpha") summary.alpha++;
    else summary.belumAbsen++;
  }
  return summary;
}

export async function listPendingLeaveRequests(supabase: TypedSupabaseClient) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*, employees:user_id(full_name, avatar_url, employee_code, branch_id)")
    .eq("status", "pending")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listMyLeaveRequests(supabase: TypedSupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("leave_requests")
    .select("*")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
