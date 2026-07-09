import { z } from "zod";

export const divisionSchema = z.object({
  id: z.string().uuid().optional(),
  branchId: z.string().uuid().nullable(),
  code: z.string().optional(),
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  description: z.string().optional(),
  isActive: z.boolean(),
});
export type DivisionInput = z.infer<typeof divisionSchema>;
