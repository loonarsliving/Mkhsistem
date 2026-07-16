"use server";

import { revalidatePath } from "next/cache";

import { resolveMarkomTaskObstacle } from "@/lib/ai/domains/markom";
import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

import {
  assignChecklistSchema,
  completeTaskSchema,
  submitObstacleSchema,
  updateTaskSchema,
  verifyTaskSchema,
  type AssignChecklistInput,
  type CompleteTaskInput,
  type SubmitObstacleInput,
  type UpdateTaskInput,
  type VerifyTaskInput,
} from "../schemas/markom.schema";

export async function assignChecklistAction(input: AssignChecklistInput): Promise<ActionResult<{ taskIds: string[] }>> {
  await requireSession();
  const parsed = assignChecklistSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kpi_assign_tasks", {
    p_branch_id: parsed.data.branchId,
    p_period_year: parsed.data.periodYear,
    p_period_month: parsed.data.periodMonth,
    p_period_week: parsed.data.periodWeek,
    p_items: parsed.data.items.map((item) => ({
      title: item.title,
      description: item.description ?? null,
      due_date: item.dueDate || null,
    })),
  });

  if (error) return actionError(error.message);

  revalidatePath("/markom");
  revalidatePath("/dashboard");
  return actionSuccess({ taskIds: data ?? [] });
}

export async function updateTaskAction(input: UpdateTaskInput): Promise<ActionResult> {
  await requireSession();
  const parsed = updateTaskSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("kpi_update_task", {
    p_task_id: parsed.data.taskId,
    p_title: parsed.data.title,
    p_description: parsed.data.description ?? null,
    p_due_date: parsed.data.dueDate || null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/markom");
  return actionSuccess();
}

export async function deleteTaskAction(taskId: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("kpi_delete_task", { p_task_id: taskId });
  if (error) return actionError(error.message);

  revalidatePath("/markom");
  return actionSuccess();
}

/** A team member checking off their own team's task -- kpi_complete_task enforces team membership and that the task is still pending; the Branch Manager's review flow (verifyTaskAction) is untouched. */
export async function completeTaskAction(input: CompleteTaskInput): Promise<ActionResult> {
  await requireSession();
  const parsed = completeTaskSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("kpi_complete_task", { p_task_id: parsed.data.taskId });

  if (error) return actionError(error.message);

  revalidatePath("/markom");
  revalidatePath("/dashboard");
  return actionSuccess();
}

/**
 * A team member reports why a still-pending task can't be done as briefed.
 * kpi_submit_obstacle_response records it (and clears any stale ai_guidance
 * from a previous round) first -- that write always succeeds independent of
 * the AI step below, so a Gemini hiccup never loses what Markom typed.
 * resolveMarkomTaskObstacle then decides, like a Branch Manager would,
 * whether to revise the brief or give guidance; kpi_apply_ai_response
 * persists that verdict. If the AI step itself fails, the action still
 * reports success (the obstacle was saved) with aiResponded: false so the
 * UI can say so instead of claiming a hard failure.
 */
export async function submitTaskObstacleAction(input: SubmitObstacleInput): Promise<ActionResult<{ aiResponded: boolean }>> {
  await requireSession();
  const parsed = submitObstacleSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error: submitError } = await supabase.rpc("kpi_submit_obstacle_response", {
    p_task_id: parsed.data.taskId,
    p_response: parsed.data.response,
  });
  if (submitError) return actionError(submitError.message);

  try {
    const { data: task, error: taskError } = await supabase
      .from("kpi_tasks")
      .select("title, description")
      .eq("id", parsed.data.taskId)
      .single();
    if (taskError || !task) throw new Error(taskError?.message ?? "Task not found");

    const resolution = await resolveMarkomTaskObstacle({
      taskTitle: task.title,
      taskDescription: task.description,
      obstacleResponse: parsed.data.response,
    });

    const { error: applyError } = await supabase.rpc("kpi_apply_ai_response", {
      p_task_id: parsed.data.taskId,
      p_action: resolution.action,
      p_new_title: resolution.newTitle ?? null,
      p_new_description: resolution.newDescription ?? null,
      p_ai_guidance: resolution.guidance,
    });
    if (applyError) throw new Error(applyError.message);
  } catch {
    revalidatePath("/markom");
    return actionSuccess({ aiResponded: false });
  }

  revalidatePath("/markom");
  return actionSuccess({ aiResponded: true });
}

export async function verifyTaskAction(input: VerifyTaskInput): Promise<ActionResult> {
  await requireSession();
  const parsed = verifyTaskSchema.safeParse(input);
  if (!parsed.success) return actionError("Data tidak valid", parsed.error.flatten().fieldErrors);

  const supabase = await createClient();
  const { error } = await supabase.rpc("kpi_verify_task", {
    p_task_id: parsed.data.taskId,
    p_status: parsed.data.status,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return actionError(error.message);

  revalidatePath("/markom");
  revalidatePath("/dashboard");
  return actionSuccess();
}
