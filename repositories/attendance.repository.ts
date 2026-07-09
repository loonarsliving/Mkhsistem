import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { AttendanceStatus } from "@/constants/app";

export async function getTodayAttendance(supabase: TypedSupabaseClient, userId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("attendance")
    .select("*")
    .eq("user_id", userId)
    .eq("attendance_date", today)
    .maybeSingle();
  if (error) throw error;
  return data;
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
