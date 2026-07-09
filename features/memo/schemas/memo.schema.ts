import { z } from "zod";

const targetSchema = z.object({
  target_type: z.enum(["all_branch", "branch", "all_division", "division", "position", "user"]),
  target_id: z.string().uuid().nullable(),
});

const attachmentSchema = z.object({
  file_url: z.string().min(1),
  file_name: z.string().min(1),
  file_size: z.number().optional(),
  mime_type: z.string().optional(),
});

export const memoFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter").max(200),
  content: z.string().min(10, "Isi memo minimal 10 karakter"),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  isPinned: z.boolean(),
  isMandatoryRead: z.boolean(),
  expiresAt: z.string().optional(),
  targets: z.array(targetSchema).min(1, "Pilih minimal 1 target penerima"),
  attachments: z.array(attachmentSchema).default([]),
});
export type MemoFormInput = z.infer<typeof memoFormSchema>;
