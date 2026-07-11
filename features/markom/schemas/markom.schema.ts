import { z } from "zod";

const checklistItemSchema = z.object({
  title: z.string().min(2, "Judul task wajib diisi").max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().optional(),
});

export const assignChecklistSchema = z.object({
  assignedTo: z.string().uuid("Karyawan wajib dipilih"),
  periodYear: z.coerce.number().int().min(2020).max(2100),
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodWeek: z.coerce.number().int().min(1).max(5),
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
