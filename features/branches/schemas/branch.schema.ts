import { z } from "zod";

export const branchSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(2, "Kode minimal 2 karakter").max(10).toUpperCase(),
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  address: z.string().optional(),
  city: z.string().optional(),
  latitude: z.coerce.number().min(-90).max(90).nullable(),
  longitude: z.coerce.number().min(-180).max(180).nullable(),
  radiusMeters: z.coerce.number().int().min(10).max(5000),
  phone: z.string().optional(),
  isHeadOffice: z.boolean(),
  isActive: z.boolean(),
});
export type BranchInput = z.infer<typeof branchSchema>;
