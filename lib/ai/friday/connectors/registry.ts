import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { HttpBusinessConnector } from "./http";
import { InternalMkhConnector } from "./internal-mkh";
import type { BusinessConnector, BusinessRegistration, BusinessSnapshot } from "./types";

/**
 * Registry — business row in, connector out.
 *
 * The whole of "FRIDAY scales to 1000 businesses without changing the Brain"
 * comes down to this switch staying this short. A new business normally adds a
 * ROW, not a branch here; a new branch is only needed when a business speaks a
 * genuinely new protocol, and even then nothing above this file changes.
 */
export const CONNECTOR_KINDS = ["internal_mkh", "http"] as const;
export type ConnectorKind = (typeof CONNECTOR_KINDS)[number];

export function isKnownConnectorKind(kind: string): kind is ConnectorKind {
  return (CONNECTOR_KINDS as readonly string[]).includes(kind);
}

export function resolveConnector(registration: BusinessRegistration): BusinessConnector {
  switch (registration.connectorKind) {
    case "internal_mkh":
      return new InternalMkhConnector(registration);
    case "http":
      return new HttpBusinessConnector(registration);
    default:
      throw new Error(`Connector kind "${registration.connectorKind}" tidak dikenal untuk bisnis ${registration.key}`);
  }
}

/** Active businesses, in display order. Inactive rows stay in the table -- a business that is paused is not a business that never existed. */
export async function listActiveBusinesses(): Promise<BusinessRegistration[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("holding_businesses")
    .select("id, key, name, business_type, connector_kind, connector_config, display_order")
    .eq("status", "active")
    .order("display_order")
    .order("name");

  if (error) throw new Error(`Gagal memuat daftar bisnis holding: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    businessType: row.business_type,
    connectorKind: row.connector_kind,
    connectorConfig:
      typeof row.connector_config === "object" && row.connector_config !== null && !Array.isArray(row.connector_config)
        ? (row.connector_config as Record<string, unknown>)
        : {},
  }));
}

/**
 * Every active business, read in parallel, each failure contained.
 *
 * Contained is the operative word. A misconfigured connector throws while
 * being *constructed* (bad baseUrl, unknown kind), and a reachable-but-broken
 * dashboard returns an 'unreachable' snapshot from fetchSnapshot(). Both end
 * up as one business marked unreachable in the group snapshot, never as an
 * exception that costs the holding its briefing. The group report is the thing
 * leadership reads first; one business's outage must degrade it, not cancel it.
 */
export async function captureHoldingSnapshots(): Promise<BusinessSnapshot[]> {
  const businesses = await listActiveBusinesses();

  return Promise.all(
    businesses.map(async (registration): Promise<BusinessSnapshot> => {
      try {
        return await resolveConnector(registration).fetchSnapshot();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("FRIDAY connector could not be constructed", { business: registration.key, kind: registration.connectorKind, error: message });
        return {
          businessKey: registration.key,
          businessName: registration.name,
          businessType: registration.businessType,
          capturedAt: new Date().toISOString(),
          health: "unreachable",
          metrics: [],
          narrative: null,
          note: `Connector bermasalah: ${message}`,
        };
      }
    }),
  );
}
