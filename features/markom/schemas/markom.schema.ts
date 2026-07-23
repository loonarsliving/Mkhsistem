import { z } from "zod";

const checklistItemSchema = z.object({
  title: z.string().min(2, "Judul task wajib diisi").max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
});

/** "general" (default) = not tied to a specific Content Planner product tab -- most manually-assigned Markom tasks (e.g. "Rapat mingguan"). Pick leasehold_sales/occupancy only for a hand-written content task that should also surface on that Content Planner tab. */
export const CONTENT_FOCUS_OPTIONS = ["general", "leasehold_sales", "occupancy"] as const;

export const assignChecklistSchema = z.object({
  branchId: z.string().uuid("Cabang wajib dipilih"),
  periodYear: z.coerce.number().int().min(2020).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodWeek: z.coerce.number().int().min(1).max(5),
  contentFocus: z.enum(CONTENT_FOCUS_OPTIONS).default("general"),
  items: z.array(checklistItemSchema).min(1, "Minimal 1 task diperlukan"),
});
export type AssignChecklistInput = z.infer<typeof assignChecklistSchema>;

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(2, "Judul task wajib diisi").max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const verifyTaskSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["completed", "rejected"], { required_error: "Status wajib dipilih" }),
  notes: z.string().max(2000).optional(),
});
export type VerifyTaskInput = z.infer<typeof verifyTaskSchema>;

export const completeTaskSchema = z.object({
  taskId: z.string().uuid(),
});
export type CompleteTaskInput = z.infer<typeof completeTaskSchema>;

export const submitObstacleSchema = z.object({
  taskId: z.string().uuid(),
  response: z.string().min(5, "Jelaskan kendala Anda (minimal 5 karakter)").max(1000),
});
export type SubmitObstacleInput = z.infer<typeof submitObstacleSchema>;
