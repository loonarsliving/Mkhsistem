import { z } from "zod";

export const CONTENT_CATEGORIES = ["problem_solution", "ugc", "edukasi", "promosi"] as const;
export const CONTENT_PLATFORMS = ["tiktok", "instagram"] as const;
export const CONTENT_STATUSES = ["idea", "draft", "scheduled", "published", "archived"] as const;
export const ORDER_CHANNELS = ["shopee", "tokopedia", "website", "offline", "other"] as const;

export const createContentItemSchema = z.object({
  category: z.enum(CONTENT_CATEGORIES),
  platform: z.enum(CONTENT_PLATFORMS),
  title: z.string().min(2, "Judul wajib diisi").max(200),
  hook: z.string().max(500).optional(),
  caption: z.string().max(2000).optional(),
  scriptNotes: z.string().max(2000).optional(),
  cta: z.string().max(300).optional(),
});
export type CreateContentItemInput = z.infer<typeof createContentItemSchema>;

export const updateContentItemStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(CONTENT_STATUSES),
  contentUrl: z.string().url("Link tidak valid").optional().or(z.literal("")),
});
export type UpdateContentItemStatusInput = z.infer<typeof updateContentItemStatusSchema>;

export const logContentMetricsSchema = z.object({
  contentItemId: z.string().uuid(),
  capturedAt: z.string().optional(),
  views: z.coerce.number().int().min(0).default(0),
  likes: z.coerce.number().int().min(0).default(0),
  comments: z.coerce.number().int().min(0).default(0),
  shares: z.coerce.number().int().min(0).default(0),
  saves: z.coerce.number().int().min(0).default(0),
  watchThrough50Pct: z.boolean().default(false),
  linkClicks: z.coerce.number().int().min(0).default(0),
  boostedSparkAds: z.boolean().default(false),
  notes: z.string().max(500).optional(),
});
export type LogContentMetricsInput = z.infer<typeof logContentMetricsSchema>;

export const logOrderSnapshotSchema = z.object({
  snapshotDate: z.string().optional(),
  channel: z.enum(ORDER_CHANNELS),
  ordersCount: z.coerce.number().int().min(0).default(0),
  unitsSold: z.coerce.number().int().min(0).default(0),
  revenueIdr: z.coerce.number().min(0).default(0),
  notes: z.string().max(500).optional(),
});
export type LogOrderSnapshotInput = z.infer<typeof logOrderSnapshotSchema>;

export const generateContentIdeasSchema = z.object({
  category: z.enum(CONTENT_CATEGORIES),
  count: z.coerce.number().int().min(1).max(5).default(3),
  context: z.string().max(1000).optional(),
});
export type GenerateContentIdeasInput = z.infer<typeof generateContentIdeasSchema>;

export const draftFaqReplySchema = z.object({
  question: z.string().min(3, "Pertanyaan wajib diisi").max(1000),
});
export type DraftFaqReplyInput = z.infer<typeof draftFaqReplySchema>;
