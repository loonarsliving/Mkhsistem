import { z } from "zod";

export const updateSystemPromptSchema = z.object({
  key: z.enum(["general", "hr", "markom", "crm"]),
  content: z.string().min(20, "Instruksi minimal 20 karakter").max(8000, "Instruksi maksimal 8000 karakter"),
});
export type UpdateSystemPromptInput = z.infer<typeof updateSystemPromptSchema>;
