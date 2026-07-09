"use client";

import { useReportWebVitals } from "next/web-vitals";

import { reportPerformanceMetricAction } from "@/features/monitoring/actions/monitoring.actions";

const TRACKED_METRICS = new Set(["CLS", "FCP", "FID", "INP", "LCP", "TTFB"]);

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (!TRACKED_METRICS.has(metric.name)) return;
    void reportPerformanceMetricAction({
      metricName: metric.name as "CLS" | "FCP" | "FID" | "INP" | "LCP" | "TTFB",
      value: metric.value,
      rating: metric.rating,
      url: window.location.href,
    });
  });

  return null;
}
