import { z } from "zod";

export const companySettingsSchema = z.object({
  companyName: z.string().min(2, "Nama perusahaan minimal 2 karakter").max(200),
  companyAddress: z.string().optional(),
  companyLogoUrl: z.string().optional(),
  timezone: z.string().min(1, "Zona waktu wajib diisi"),
  defaultRadiusMeters: z.coerce.number().int().min(10).max(5000),
});
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
