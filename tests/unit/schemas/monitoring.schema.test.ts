import { describe, expect, it } from "vitest";

import { reportClientErrorSchema, reportPerformanceMetricSchema } from "@/features/monitoring/schemas/monitoring.schema";

describe("reportClientErrorSchema", () => {
  it("accepts a minimal valid payload and defaults level to error", () => {
    const result = reportClientErrorSchema.safeParse({ message: "boom" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.level).toBe("error");
  });

  it("accepts a fully populated payload", () => {
    const result = reportClientErrorSchema.safeParse({
      level: "fatal",
      message: "boom",
      stack: "at foo (bar.ts:1:1)",
      digest: "abc123",
      url: "https://example.com/dashboard",
      context: { componentStack: "<App>" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty message", () => {
    expect(reportClientErrorSchema.safeParse({ message: "" }).success).toBe(false);
  });

  it("rejects an unknown level", () => {
    expect(reportClientErrorSchema.safeParse({ message: "x", level: "critical" }).success).toBe(false);
  });
});

describe("reportPerformanceMetricSchema", () => {
  it("accepts a valid Web Vitals sample", () => {
    const result = reportPerformanceMetricSchema.safeParse({
      metricName: "LCP",
      value: 2100.5,
      rating: "good",
      url: "https://example.com/dashboard",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a metric name outside the tracked set", () => {
    expect(reportPerformanceMetricSchema.safeParse({ metricName: "XYZ", value: 1, rating: "good" }).success).toBe(false);
  });

  it("rejects a non-finite value", () => {
    expect(reportPerformanceMetricSchema.safeParse({ metricName: "CLS", value: Infinity, rating: "good" }).success).toBe(
      false,
    );
  });

  it("requires metricName, value and rating", () => {
    expect(reportPerformanceMetricSchema.safeParse({}).success).toBe(false);
  });
});
