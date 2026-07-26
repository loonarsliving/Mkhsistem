import { z } from "zod";

export const runBriefingSchema = z.object({
  question: z
    .string()
    .trim()
    .max(500, "Pertanyaan maksimal 500 karakter")
    .optional()
    .or(z.literal("")),
});

export type RunBriefingInput = z.infer<typeof runBriefingSchema>;

export const decideActionSchema = z.object({
  actionId: z.string().uuid("ID aksi tidak valid"),
  decision: z.enum(["approve", "reject"]),
});

export type DecideActionInput = z.infer<typeof decideActionSchema>;
