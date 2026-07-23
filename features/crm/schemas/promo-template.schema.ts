import { z } from "zod";

export const createPromoTemplateSchema = z.object({
  branchId: z.string().uuid().optional(),
  name: z.string().min(3, "Nama template minimal 3 karakter").max(150),
  messageBody: z.string().min(10, "Isi pesan minimal 10 karakter").max(2000),
  photoStoragePath: z.string().optional(),
  photoPublicUrl: z.string().url().optional(),
  cadenceDays: z.coerce.number().int().min(1).max(90),
  sendHourLocal: z.coerce.number().int().min(0).max(23),
});
export type CreatePromoTemplateInput = z.infer<typeof createPromoTemplateSchema>;

export const updatePromoTemplateSchema = createPromoTemplateSchema.partial().extend({
  id: z.string().uuid(),
});
export type UpdatePromoTemplateInput = z.infer<typeof updatePromoTemplateSchema>;
