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

export const announcementFormSchema = z.object({
  title: z.string().min(3, "Judul minimal 3 karakter").max(200),
  content: z.string().min(10, "Isi pengumuman minimal 10 karakter"),
  categoryId: z.string().uuid().nullable(),
  isPinned: z.boolean(),
  expiresAt: z.string().optional(),
  targets: z.array(targetSchema).min(1, "Pilih minimal 1 target penerima"),
  attachments: z.array(attachmentSchema).default([]),
});
export type AnnouncementFormInput = z.infer<typeof announcementFormSchema>;

export const announcementCategorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2, "Nama kategori minimal 2 karakter").max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Format warna tidak valid"),
});
export type AnnouncementCategoryInput = z.infer<typeof announcementCategorySchema>;
