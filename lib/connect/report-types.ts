/**
 * Report card shape for the Loonars Connect departments beyond Hospitality
 * (Markom Jogja, Sales Jogja). Hospitality keeps its own richer shape
 * (lib/hospitality/report.ts); these departments share one renderer.
 *
 * Rules carried over from Hospitality: every value is computed in code from
 * source records, a source that failed is `value: null` with the reason
 * (shown as "?"), and a missing report is listed, never read as "fine".
 */

import type { PeriodKind, SourceResult } from "@/lib/hospitality/report";

export type ConnectReportKind = "markom" | "sales";

export interface ConnectMetric {
  key: string;
  label: string;
  value: number | null;
  /** optional "of N" denominator, e.g. 3 / 5 published */
  total?: number | null;
  source: string;
  note?: string;
  tone?: "good" | "warn" | "bad";
}

export interface ConnectSection {
  key: string;
  title: string;
  tone: "bad" | "warn" | "info";
  items: string[];
}

export interface ConnectReportData {
  version: 1;
  kind: ConnectReportKind;
  departmentCode: string;
  periodKind: PeriodKind;
  reportDate: string;
  timezone: string;
  generatedAt: string;
  window: { from: string; to: string };
  metrics: ConnectMetric[];
  sections: ConnectSection[];
  failedSources: { source: string; error: string }[];
  caveats: string[];
}

export function unavailableMetric(key: string, label: string, source: string, result: SourceResult<unknown>): ConnectMetric {
  return { key, label, value: null, source, note: result.ok ? undefined : `Data tidak tersedia: ${result.error}` };
}

export function fromSnapshotSection<T>(section: unknown): SourceResult<T> {
  const s = section as { ok?: boolean; error?: string; fetched_at?: string; data?: T } | undefined;
  if (!s) return { ok: false, error: "Bagian snapshot tidak ada" };
  if (!s.ok) return { ok: false, error: s.error ?? "gagal" };
  return { ok: true, fetchedAt: s.fetched_at ?? new Date().toISOString(), data: s.data as T };
}

/** "dd-mm" for list lines. */
export function shortDate(isoDate: string): string {
  const [, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}-${m}`;
}

export function summarizeConnectReport(title: string, data: ConnectReportData): string {
  const head = data.metrics
    .slice(0, 4)
    .map((m) => `${m.label} ${m.value === null ? "?" : m.value}${m.total != null ? `/${m.total}` : ""}`)
    .join(" · ");
  const flags = data.sections.filter((s) => s.tone === "bad" && s.items.length > 0).map((s) => `${s.items.length} ${s.title.toLowerCase()}`);
  if (data.failedSources.length) flags.push("⚠ ada data tidak tersedia");
  const [y, mo, d] = data.reportDate.split("-");
  return `${title} ${d}-${mo}-${y} · ${head}${flags.length ? ` — ${flags.join(" · ")}` : ""}`;
}
