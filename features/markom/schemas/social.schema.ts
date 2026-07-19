import { z } from "zod";

const competitorFocusSchema = z.enum(["leasehold_sales", "occupancy", "beauty"]);

export const createCompetitorAccountSchema = z.object({
  platform: z.enum(["instagram", "tiktok"]),
  handle: z.string().min(1, "Handle wajib diisi").max(100),
  displayName: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
  contentFocus: competitorFocusSchema,
});
export type CreateCompetitorAccountInput = z.infer<typeof createCompetitorAccountSchema>;

export const createCompetitorContentLogSchema = z.object({
  competitorAccountId: z.string().uuid(),
  focus: competitorFocusSchema,
  contentUrl: z.string().url().optional().or(z.literal("")),
  contentType: z.enum(["reel", "video", "photo", "carousel", "story", "other"]).optional(),
  hook: z.string().max(300).optional(),
  durationSeconds: z.coerce.number().int().min(0).max(3600).optional(),
  caption: z.string().max(1000).optional(),
  hashtags: z.string().max(500).optional(),
  engagementNotes: z.string().max(500).optional(),
});
export type CreateCompetitorContentLogInput = z.infer<typeof createCompetitorContentLogSchema>;
