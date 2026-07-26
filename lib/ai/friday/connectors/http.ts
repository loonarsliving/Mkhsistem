import "server-only";

import { logger } from "@/lib/logger";

import {
  type BusinessConnector,
  type BusinessRegistration,
  type BusinessSnapshot,
  type ConnectorAutomation,
  type ConnectorStatus,
  type MetricUnit,
  type NormalizedMetric,
} from "./types";

/**
 * The generic connector for a business that runs its own dashboard.
 *
 * This is the file that makes "1 business or 1000" a configuration question
 * instead of an engineering one. Onboarding Villa's PMS, the Kos dashboard, or
 * a hotel system nobody has picked yet means inserting one holding_businesses
 * row — not writing another connector, and never touching the Brain.
 *
 * What the other side must expose is small on purpose: one GET returning its
 * metrics and its own narrative. A business that can produce a JSON endpoint
 * can join the group; one that cannot is not blocked from existing, it simply
 * is not visible to FRIDAY until it can.
 *
 * ---------------------------------------------------------------------------
 * CREDENTIALS ARE NAMED HERE, NEVER STORED HERE
 * ---------------------------------------------------------------------------
 * connector_config lives in a database table that every holding.view holder
 * can read. A bearer token written into that JSON would be a credential handed
 * to everyone with read access to the console. So the config carries the NAME
 * of an environment variable (`authEnvVar`) and the value is resolved from the
 * server environment at call time. Rotating a token is a Vercel env change,
 * and the table never holds a secret in the first place.
 *
 * ---------------------------------------------------------------------------
 * WHY THE URL IS VALIDATED
 * ---------------------------------------------------------------------------
 * baseUrl is operator-supplied data that this server then fetches. Without a
 * check, someone holding holding.manage could point a "business" at an
 * internal address and use FRIDAY's scheduled briefing as a request proxy into
 * the private network. Requiring https and refusing loopback/link-local hosts
 * costs nothing and closes that.
 */

interface HttpConnectorConfig {
  baseUrl: string;
  snapshotPath?: string;
  automationsPath?: string;
  runAutomationPath?: string;
  /** NAME of the env var holding the bearer token — not the token. */
  authEnvVar?: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const BLOCKED_HOSTNAMES = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal", "169.254.169.254"]);

function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`baseUrl connector tidak valid: "${raw}"`);
  }
  if (url.protocol !== "https:") throw new Error("baseUrl connector harus https");
  const host = url.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".internal") || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    throw new Error(`Host connector tidak diizinkan: ${host}`);
  }
  return url;
}

function parseConfig(raw: Record<string, unknown>): HttpConnectorConfig {
  const baseUrl = typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "";
  if (!baseUrl) throw new Error("connector_config.baseUrl wajib diisi untuk connector http");
  assertSafeUrl(baseUrl);

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    snapshotPath: typeof raw.snapshotPath === "string" ? raw.snapshotPath : "/api/friday/snapshot",
    automationsPath: typeof raw.automationsPath === "string" ? raw.automationsPath : undefined,
    runAutomationPath: typeof raw.runAutomationPath === "string" ? raw.runAutomationPath : undefined,
    authEnvVar: typeof raw.authEnvVar === "string" ? raw.authEnvVar : undefined,
    timeoutMs: typeof raw.timeoutMs === "number" && raw.timeoutMs > 0 ? Math.min(raw.timeoutMs, 30_000) : DEFAULT_TIMEOUT_MS,
  };
}

const VALID_UNITS: readonly string[] = ["idr", "count", "percent", "days", "ratio"];

/**
 * The remote dashboard is another team's code. It is parsed as untrusted
 * input: unknown units are dropped rather than guessed, non-numeric values
 * become null rather than NaN, and a metric without a key is discarded. A
 * malformed metric costs that one line, never the business's whole snapshot.
 */
function parseMetrics(raw: unknown): NormalizedMetric[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry): NormalizedMetric[] => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;

    const key = typeof item.key === "string" ? item.key.trim() : "";
    const unit = typeof item.unit === "string" ? item.unit.trim() : "";
    if (!key || !VALID_UNITS.includes(unit)) return [];

    const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

    return [
      {
        key,
        label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : key,
        value: num(item.value),
        unit: unit as MetricUnit,
        previousValue: num(item.previousValue),
        period: typeof item.period === "string" ? item.period : undefined,
        freshnessDays: num(item.freshnessDays),
        direction:
          item.direction === "higher_better" || item.direction === "lower_better" || item.direction === "neutral" ? item.direction : undefined,
      },
    ];
  });
}

export class HttpBusinessConnector implements BusinessConnector {
  readonly kind = "http";
  private readonly config: HttpConnectorConfig;

  constructor(private readonly registration: BusinessRegistration) {
    this.config = parseConfig(registration.connectorConfig);
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.config.authEnvVar) {
      const token = process.env[this.config.authEnvVar];
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const url = assertSafeUrl(`${this.config.baseUrl}${path}`);
    return fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: "no-store",
    });
  }

  async fetchSnapshot(): Promise<BusinessSnapshot> {
    const base = {
      businessKey: this.registration.key,
      businessName: this.registration.name,
      businessType: this.registration.businessType,
      capturedAt: new Date().toISOString(),
    };

    try {
      const response = await this.request(this.config.snapshotPath ?? "/api/friday/snapshot");
      if (!response.ok) {
        return { ...base, health: "unreachable", metrics: [], narrative: null, note: `Dashboard menjawab HTTP ${response.status}` };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const metrics = parseMetrics(payload.metrics);
      const narrative = typeof payload.narrative === "string" ? payload.narrative : null;

      if (metrics.length === 0 && !narrative) {
        return { ...base, health: "degraded", metrics: [], narrative: null, note: "Dashboard menjawab tapi tidak mengirim metrik maupun narasi yang bisa dibaca." };
      }

      return {
        ...base,
        capturedAt: typeof payload.capturedAt === "string" ? payload.capturedAt : base.capturedAt,
        health: metrics.length === 0 ? "degraded" : "ok",
        metrics,
        narrative,
        note: metrics.length === 0 ? "Tidak ada metrik terstruktur — hanya narasi, jadi bisnis ini tidak bisa dibandingkan secara angka." : null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("FRIDAY http connector failed", { business: this.registration.key, error: message });
      // Never a thrown error and never zeros: one unreachable business must not
      // cost the group its briefing, and must not be read as a business with
      // nothing happening in it.
      return { ...base, health: "unreachable", metrics: [], narrative: null, note: `Dashboard tidak dapat dihubungi: ${message}` };
    }
  }

  async healthCheck(): Promise<ConnectorStatus> {
    try {
      const response = await this.request(this.config.snapshotPath ?? "/api/friday/snapshot", { method: "HEAD" });
      return { reachable: response.ok, detail: response.ok ? "Dashboard merespons" : `HTTP ${response.status}` };
    } catch (err) {
      return { reachable: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async listAutomations(): Promise<ConnectorAutomation[]> {
    if (!this.config.automationsPath) return [];
    try {
      const response = await this.request(this.config.automationsPath);
      if (!response.ok) return [];
      const payload = (await response.json()) as { automations?: unknown };
      if (!Array.isArray(payload.automations)) return [];

      return payload.automations.flatMap((entry): ConnectorAutomation[] => {
        if (typeof entry !== "object" || entry === null) return [];
        const item = entry as Record<string, unknown>;
        const key = typeof item.key === "string" ? item.key.trim() : "";
        if (!key) return [];
        return [
          {
            key,
            label: typeof item.label === "string" ? item.label : key,
            description: typeof item.description === "string" ? item.description : "",
          },
        ];
      });
    } catch {
      return [];
    }
  }

  async runAutomation(key: string, payload: Record<string, unknown>): Promise<string> {
    if (!this.config.runAutomationPath) {
      throw new Error(`Bisnis ${this.registration.name} tidak mengekspos jalur menjalankan automation`);
    }

    const response = await this.request(this.config.runAutomationPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, payload }),
    });
    if (!response.ok) {
      throw new Error(`Dashboard ${this.registration.name} menolak automation "${key}": HTTP ${response.status}`);
    }

    const result = (await response.json().catch(() => ({}))) as { message?: unknown };
    return typeof result.message === "string" ? result.message : `Automation "${key}" dijalankan di ${this.registration.name}`;
  }
}
