"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  checkInSchema,
  checkOutSchema,
  decideLeaveRequestSchema,
  leaveRequestSchema,
  type CheckInInput,
  type CheckOutInput,
  type DecideLeaveRequestInput,
  type LeaveRequestInput,
} from "../schemas/attendance.schema";

// The RPCs raise English messages; staff only read Indonesian.
const RPC_ERROR_MESSAGES: Record<string, string> = {
  "Already checked in today": "Anda sudah check-in hari ini. Muat ulang halaman untuk melihat status terbaru.",
  "You must check in before checking out": "Tidak ada shift terbuka untuk di-check-out. Muat ulang halaman, lalu check in dulu.",
  "Already checked out today": "Anda sudah check-out. Muat ulang halaman untuk melihat status terbaru.",
  "Employee or branch not found": "Data karyawan/cabang Anda belum lengkap. Hubungi HR.",
  "Not authenticated": "Sesi login habis. Silakan login ulang.",
};

function attendanceRpcError(message: string) {
  return RPC_ERROR_MESSAGES[message] ?? message;
}

export async function checkInAction(input: CheckInInput): Promise<ActionResult> {
  await requireSession();
  const parsed = checkInSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_check_in", {
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
    p_photo_url: parsed.data.photoUrl,
    p_note: parsed.data.note ?? null,
  });

  if (error) return actionError(attendanceRpcError(error.message));

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  revalidatePath("/refund");
  return actionSuccess();
}

export async function checkOutAction(input: CheckOutInput): Promise<ActionResult> {
  await requireSession();
  const parsed = checkOutSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("attendance_check_out", {
    p_latitude: parsed.data.latitude,
    p_longitude: parsed.data.longitude,
    p_photo_url: parsed.data.photoUrl,
    p_note: parsed.data.note ?? null,
  });

  if (error) return actionError(attendanceRpcError(error.message));

  revalidatePath("/dashboard");
  revalidatePath("/attendance");
  revalidatePath("/refund");
  return actionSuccess();
}

export async function submitLeaveRequestAction(input: LeaveRequestInput): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = leaveRequestSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").insert({
    user_id: session.userId,
    type: parsed.data.type,
    start_date: parsed.data.startDate,
    end_date: parsed.data.endDate,
    reason: parsed.data.reason,
    attachment_url: parsed.data.attachmentUrl ?? null,
    created_by: session.userId,
    updated_by: session.userId,
  });

  if (error) return actionError(error.message);

  revalidatePath("/attendance/history");
  return actionSuccess();
}

export async function decideLeaveRequestAction(input: DecideLeaveRequestInput): Promise<ActionResult> {
  await requireSession();
  const parsed = decideLeaveRequestSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_leave_request", {
    p_leave_request_id: parsed.data.leaveRequestId,
    p_approve: parsed.data.approve,
    p_rejection_reason: parsed.data.rejectionReason ?? null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/attendance/history");
  return actionSuccess();
}
