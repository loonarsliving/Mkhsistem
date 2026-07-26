import "server-only";

/**
 * The Connector contract — the boundary between FRIDAY and a business's own
 * operational system.
 *
 * The premise this whole layer exists to protect: every business keeps its own
 * source of truth. Villa runs its PMS, Kos runs its dashboard, Developer runs
 * MK Connect, and a future hotel will run something nobody has chosen yet.
 * FRIDAY is not where that data lives and must never become the system those
 * businesses are forced to adopt. It reads through a connector, and that is
 * the only way it ever reads.
 *
 * So a connector does exactly four things — fetch data, push data, run an
 * automation, report status — and holds NO business logic. The moment a
 * connector starts deciding what a number means, the source of truth has
 * quietly moved into FRIDAY and the independence above is gone.
 *
 * ---------------------------------------------------------------------------
 * WHY NORMALIZED METRICS, AND WHY A NARRATIVE ALONGSIDE THEM
 * ---------------------------------------------------------------------------
 * A coffee shop has no leasehold pipeline; a property developer has no covers
 * per night. If the group snapshot were the union of every business's native
 * shape, the Brain would need to know all of them — and adding business #12
 * would mean editing the Brain, which is precisely the thing that must not
 * happen (see BUSINESS SCALE in the vision: the Brain stays fixed, connectors
 * and dashboards grow).
 *
 * Hence two channels, deliberately:
 *
 *   metrics[]  — a small normalized vocabulary every business can answer in.
 *                Comparable across businesses, so "which unit is dragging the
 *                group" is arithmetic rather than interpretation.
 *   narrative  — that business's own detailed, domain-shaped text, passed to
 *                the model untouched. This is where a villa gets to talk about
 *                occupancy and a developer about stalled prospects.
 *
 * Comparison runs on the first. Explanation runs on the second. Neither
 * requires the Brain to learn a new domain.
 */

/** What a metric's number means, so the model never reads rupiah as a count. */
export type MetricUnit = "idr" | "count" | "percent" | "days" | "ratio";

/** Which way is good. Without this, FRIDAY cannot tell a rising cost from rising revenue. */
export type MetricDirection = "higher_better" | "lower_better" | "neutral";

export interface NormalizedMetric {
  /** Stable machine key. Shared keys across businesses are what make comparison possible — see HOLDING_METRIC_KEYS. */
  key: string;
  label: string;
  /** null means "this business cannot answer this metric" — never coerce to 0. A zero and an unanswerable metric lead to opposite conclusions. */
  value: number | null;
  unit: MetricUnit;
  direction?: MetricDirection;
  /** Comparison figure for the immediately preceding equivalent period, when the business can produce one. */
  previousValue?: number | null;
  /** e.g. "7 hari terakhir", "bulan berjalan". Rendered next to the number so the model never compares a week against a month. */
  period?: string;
  /**
   * How old the underlying data is. The finance-sync incident (migration 0182
   * notes, and the fix in signals.ts) is exactly why this is part of the
   * contract rather than an optional extra: a stale number presented as
   * current produced a cash-crisis recommendation against a branch that had
   * simply not been synced.
   */
  freshnessDays?: number | null;
}

/**
 * The shared vocabulary. A business answers whichever of these it genuinely
 * has and omits the rest — an omitted metric is honest, a fabricated one is
 * not.
 *
 * Kept deliberately short. This is the set of questions an executive asks of
 * ANY business regardless of what it sells; anything domain-specific belongs
 * in the narrative, not here.
 */
export const HOLDING_METRIC_KEYS = {
  REVENUE: "revenue",
  CASH_BALANCE: "cash_balance",
  OPERATING_COST: "operating_cost",
  UTILIZATION: "utilization",
  NEW_LEADS: "new_leads",
  CONVERSIONS: "conversions",
  PIPELINE_NEGLECT: "pipeline_neglect",
  MARKETING_SPEND: "marketing_spend",
  COST_PER_LEAD: "cost_per_lead",
  HEADCOUNT_PRESENT: "headcount_present",
  OPEN_TASKS_OVERDUE: "open_tasks_overdue",
} as const;

export type HoldingMetricKey = (typeof HOLDING_METRIC_KEYS)[keyof typeof HOLDING_METRIC_KEYS];

/**
 * ok         — data arrived and is usable.
 * degraded   — data arrived but part of it is missing or stale; usable with stated caveats.
 * unreachable— the connector could not be reached at all.
 *
 * 'unreachable' is never rendered as zeros. A business FRIDAY cannot see is
 * reported as a business FRIDAY cannot see, because "this unit produced no
 * revenue" and "this unit's system did not answer" are opposite findings.
 */
export type ConnectorHealth = "ok" | "degraded" | "unreachable";

export interface BusinessSnapshot {
  businessKey: string;
  businessName: string;
  businessType: string;
  capturedAt: string;
  health: ConnectorHealth;
  metrics: NormalizedMetric[];
  /** The business's own domain-shaped detail, passed through to the model verbatim. Optional — a thin connector may supply metrics only. */
  narrative?: string | null;
  /** Populated whenever health is not 'ok'. Shown to the model and to the reader; never swallowed. */
  note?: string | null;
}

/** Automations a connector can be asked to run, described by the business itself so FRIDAY never hardcodes another system's endpoints. */
export interface ConnectorAutomation {
  key: string;
  label: string;
  description: string;
}

export interface ConnectorStatus {
  reachable: boolean;
  detail: string;
}

/**
 * Four verbs, no more. Anything a connector cannot express through these
 * belongs in the business's own system, not here.
 */
export interface BusinessConnector {
  readonly kind: string;
  /** Fetch. Must resolve — a failure is returned as an 'unreachable' snapshot, never thrown, so one dead business cannot cost the group its briefing. */
  fetchSnapshot(): Promise<BusinessSnapshot>;
  /** Status. */
  healthCheck(): Promise<ConnectorStatus>;
  /** The automations this business exposes. Empty for a read-only connector. */
  listAutomations(): Promise<ConnectorAutomation[]>;
  /** Run one. Throws on failure — unlike fetch, a requested action failing is something a human is waiting on and must hear about. */
  runAutomation(key: string, payload: Record<string, unknown>): Promise<string>;
}

/** The registry row a connector is built from. Config shape is per-kind and validated by that kind, not here. */
export interface BusinessRegistration {
  id: string;
  key: string;
  name: string;
  businessType: string;
  connectorKind: string;
  connectorConfig: Record<string, unknown>;
}

export function metric(
  key: string,
  label: string,
  value: number | null,
  unit: MetricUnit,
  extra?: Partial<Omit<NormalizedMetric, "key" | "label" | "value" | "unit">>,
): NormalizedMetric {
  return { key, label, value, unit, ...extra };
}
