import { z } from "zod";

export const positionSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().optional(),
  name: z.string().min(2, "Nama minimal 2 karakter").max(100),
  level: z.coerce.number().int().min(1).max(999),
  description: z.string().optional(),
  isActive: z.boolean(),
});
export type PositionInput = z.infer<typeof positionSchema>;
