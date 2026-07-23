import { z } from "zod";

export const createProjectPhotoSchema = z.object({
  projectId: z.string().uuid("Project wajib dipilih"),
  storagePath: z.string().min(1),
  publicUrl: z.string().url(),
  caption: z.string().max(300).optional(),
  mediaType: z.enum(["image", "video"]).default("image"),
});
export type CreateProjectPhotoInput = z.infer<typeof createProjectPhotoSchema>;
