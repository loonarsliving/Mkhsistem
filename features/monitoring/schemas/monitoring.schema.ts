import { z } from "zod";

export const reportClientErrorSchema = z.object({
  level: z.enum(["warning", "error", "fatal"]).default("error"),
  message: z.string().min(1).max(2000),
  stack: z.string().max(10_000).optional(),
  digest: z.string().max(200).optional(),
  url: z.string().max(2000).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});
export type ReportClientErrorInput = z.infer<typeof reportClientErrorSchema>;

export const reportPerformanceMetricSchema = z.object({
  metricName: z.enum(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]),
  value: z.number().finite(),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  url: z.string().max(2000).optional(),
});
export type ReportPerformanceMetricInput = z.infer<typeof reportPerformanceMetricSchema>;
