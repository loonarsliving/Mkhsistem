import { z } from "zod";

export const createFollowupSchema = z.object({
  title: z.string().trim().min(3, "Judul minimal 3 karakter").max(200, "Judul maksimal 200 karakter"),
  assignedTo: z.string().trim().max(120, "Maksimal 120 karakter").optional().or(z.literal("")),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Format tanggal tidak valid")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(1000, "Catatan maksimal 1000 karakter").optional().or(z.literal("")),
});

export type CreateFollowupInput = z.infer<typeof createFollowupSchema>;
