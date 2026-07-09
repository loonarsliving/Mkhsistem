"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  createWorkSchedule,
  deleteWorkSchedule,
  updateWorkSchedule,
} from "@/repositories/work-schedule.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import { workScheduleSchema, type WorkScheduleInput } from "../schemas/attendance.schema";

export async function saveWorkScheduleAction(input: WorkScheduleInput): Promise<ActionResult> {
  const session = await requirePermission("attendance.settings_manage");
  const parsed = workScheduleSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const payload = {
    branch_id: parsed.data.branchId,
    name: parsed.data.name,
    start_time: parsed.data.startTime,
    end_time: parsed.data.endTime,
    late_tolerance_minutes: parsed.data.lateToleranceMinutes,
    work_days: parsed.data.workDays,
    is_default: parsed.data.isDefault,
    updated_by: session.userId,
  };

  try {
    if (parsed.data.id) {
      await updateWorkSchedule(supabase, parsed.data.id, payload);
    } else {
      await createWorkSchedule(supabase, { ...payload, created_by: session.userId });
    }
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan jadwal kerja");
  }

  revalidatePath("/attendance/settings");
  return actionSuccess();
}

export async function deleteWorkScheduleAction(id: string): Promise<ActionResult> {
  await requirePermission("attendance.settings_manage");
  const supabase = await createClient();
  try {
    await deleteWorkSchedule(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus jadwal kerja");
  }
  revalidatePath("/attendance/settings");
  return actionSuccess();
}
