import { z } from "zod";

export const submitWbsProgressSchema = z.object({
  projectWbsId: z.string().uuid(),
  progressPct: z.number().min(0, "Progress minimal 0").max(100, "Progress maksimal 100"),
  photoUrl: z.string().trim().optional().or(z.literal("")),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});
export type SubmitWbsProgressInput = z.infer<typeof submitWbsProgressSchema>;

export const decideWbsProgressSchema = z.object({
  logId: z.string().uuid(),
  approve: z.boolean(),
  rejectReason: z.string().trim().max(500).optional().or(z.literal("")),
});
export type DecideWbsProgressInput = z.infer<typeof decideWbsProgressSchema>;
