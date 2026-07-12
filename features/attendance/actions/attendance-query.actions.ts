"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { getSignedUrls } from "@/services/storage.service";
import { STORAGE_BUCKETS, type AttendanceStatus } from "@/constants/app";
import {
  listAttendanceHistory,
  listMyLeaveRequests,
  listPendingLeaveRequests,
  type AttendanceHistoryFilters,
} from "@/repositories/attendance.repository";

export async function listAttendanceHistoryAction(filters: AttendanceHistoryFilters) {
  const session = await requireSession();
  const supabase = await createClient();

  const scoped: AttendanceHistoryFilters = { ...filters };
  if (!session.permissions.includes("attendance.view_all") && !session.permissions.includes("attendance.view_branch")) {
    scoped.userId = session.userId;
  }

  return listAttendanceHistory(supabase, scoped);
}

export async function getAttendanceSelfieUrlsAction(paths: (string | null)[]) {
  await requireSession();
  return getSignedUrls(STORAGE_BUCKETS.ATTENDANCE_SELFIES, paths);
}

/**
 * Full detail for one attendance record -- location + selfie for both
 * check-in and check-out, for the click-through detail dialog. Row access
 * (own record, or attendance.view_branch/view_all) is enforced entirely by
 * the existing `attendance_select` RLS policy; no extra scoping needed here.
 */
export async function getAttendanceDetailAction(attendanceId: string) {
  await requireSession();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance")
    .select("*, employees:user_id(full_name, avatar_url, employee_code), branches:branch_id(name)")
    .eq("id", attendanceId)
    .single();
  if (error) throw error;

  const signedUrls = await getSignedUrls(STORAGE_BUCKETS.ATTENDANCE_SELFIES, [data.check_in_photo_url, data.check_out_photo_url]);

  return {
    ...data,
    check_in_photo_signed_url: data.check_in_photo_url ? (signedUrls[data.check_in_photo_url] ?? null) : null,
    check_out_photo_signed_url: data.check_out_photo_url ? (signedUrls[data.check_out_photo_url] ?? null) : null,
  };
}

export async function listMyLeaveRequestsAction() {
  const session = await requireSession();
  const supabase = await createClient();
  return listMyLeaveRequests(supabase, session.userId);
}

export async function listPendingLeaveRequestsAction() {
  await requireSession();
  const supabase = await createClient();
  return listPendingLeaveRequests(supabase);
}

export async function exportAttendanceHistoryCsvAction(filters: AttendanceHistoryFilters): Promise<string> {
  const session = await requireSession();
  const supabase = await createClient();

  const scoped: AttendanceHistoryFilters = { ...filters, page: 1, pageSize: 5000 };
  if (!session.permissions.includes("attendance.view_all") && !session.permissions.includes("attendance.view_branch")) {
    scoped.userId = session.userId;
  }

  const { items } = await listAttendanceHistory(supabase, scoped);

  const header = ["Tanggal", "Nama", "Kode Karyawan", "Status", "Jam Masuk", "Jam Pulang", "Catatan Masuk", "Catatan Pulang"];
  const rows = items.map((row) => {
    const employee = row.employees as { full_name?: string; employee_code?: string } | null;
    return [
      row.attendance_date,
      employee?.full_name ?? "",
      employee?.employee_code ?? "",
      row.status as AttendanceStatus,
      row.check_in_time ? new Date(row.check_in_time).toLocaleTimeString("id-ID") : "",
      row.check_out_time ? new Date(row.check_out_time).toLocaleTimeString("id-ID") : "",
      row.check_in_note ?? "",
      row.check_out_note ?? "",
    ];
  });

  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header, ...rows].map((row) => row.map((cell) => escape(String(cell))).join(",")).join("\n");
}
