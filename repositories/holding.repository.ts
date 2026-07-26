import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { FridayBriefingStatusDb, FridaySeverityDb, HoldingBusinessStatusDb, HoldingConnectorKindDb, Json } from "@/types/database.types";

/**
 * Queries behind /friday/holding — the group view.
 *
 * Read-only, like friday.repository.ts. Briefings are written by the AI job
 * processor and the registry is written by permission-checked server actions
 * running as service_role; nothing here writes.
 */

export interface HoldingBusinessView {
  id: string;
  key: string;
  name: string;
  businessType: string;
  sourceSystem: string | null;
  status: HoldingBusinessStatusDb;
  connectorKind: HoldingConnectorKindDb;
  /** Endpoint only, for the console. Never includes a credential — connector_config stores an env var NAME, not a token (migration 0182). */
  baseUrl: string | null;
  displayOrder: number;
  notes: string | null;
}

export interface BusinessHealthView {
  businessKey: string;
  status: string;
  ringkasan: string;
  temuanUtama: string;
  prioritas: number;
}

export interface HoldingBriefingView {
  id: string;
  status: FridayBriefingStatusDb;
  severity: FridaySeverityDb | null;
  headline: string | null;
  situasi: string | null;
  analisa: string | null;
  risiko: string | null;
  rekomendasi: string | null;
  hasilDiharapkan: string | null;
  solusi: { judul: string; ringkasan: string; keuntungan: string; kerugian: string; biaya_estimasi: string; dampak: string }[];
  businessHealth: BusinessHealthView[];
  modelNote: string | null;
  errorDetail: string | null;
  triggerSource: string;
  generatedAt: string | null;
  createdAt: string;
}

function text(item: Record<string, unknown>, key: string, fallback = "—"): string {
  return typeof item[key] === "string" && (item[key] as string).trim() ? (item[key] as string) : fallback;
}

/** jsonb is whatever was written, so every entry is shaped defensively — one malformed row must not throw during render. */
function toBusinessHealth(raw: Json): BusinessHealthView[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((entry): BusinessHealthView[] => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
      const item = entry as Record<string, unknown>;
      const businessKey = typeof item.business_key === "string" ? item.business_key : "";
      if (!businessKey) return [];
      return [
        {
          businessKey,
          status: text(item, "status", "data_tidak_tersedia"),
          ringkasan: text(item, "ringkasan"),
          temuanUtama: text(item, "temuan_utama"),
          prioritas: typeof item.prioritas === "number" ? item.prioritas : 99,
        },
      ];
    })
    .sort((a, b) => a.prioritas - b.prioritas);
}

function toSolutions(raw: Json): HoldingBriefingView["solusi"] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): HoldingBriefingView["solusi"] => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const judul = typeof item.judul === "string" ? item.judul : "";
    if (!judul) return [];
    return [
      {
        judul,
        ringkasan: text(item, "ringkasan"),
        keuntungan: text(item, "keuntungan"),
        kerugian: text(item, "kerugian"),
        biaya_estimasi: text(item, "biaya_estimasi"),
        dampak: text(item, "dampak", "sedang"),
      },
    ];
  });
}

export async function listHoldingBusinesses(supabase: TypedSupabaseClient): Promise<HoldingBusinessView[]> {
  const { data, error } = await supabase
    .from("holding_businesses")
    .select("id, key, name, business_type, source_system, status, connector_kind, connector_config, display_order, notes")
    .order("display_order")
    .order("name");
  if (error || !data) return [];

  return data.map((row) => {
    const config = typeof row.connector_config === "object" && row.connector_config !== null && !Array.isArray(row.connector_config) ? (row.connector_config as Record<string, unknown>) : {};
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      businessType: row.business_type,
      sourceSystem: row.source_system,
      status: row.status,
      connectorKind: row.connector_kind,
      baseUrl: typeof config.baseUrl === "string" ? config.baseUrl : null,
      displayOrder: row.display_order,
      notes: row.notes,
    };
  });
}

const HOLDING_COLUMNS =
  "id, status, severity, headline, situasi, analisa, risiko, rekomendasi, hasil_diharapkan, solusi, business_health, model_note, error_detail, trigger_source, generated_at, created_at";

export async function getLatestHoldingBriefing(supabase: TypedSupabaseClient): Promise<HoldingBriefingView | null> {
  const { data, error } = await supabase
    .from("friday_briefings")
    .select(HOLDING_COLUMNS)
    .eq("scope", "holding")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;

  return {
    id: data.id,
    status: data.status,
    severity: data.severity,
    headline: data.headline,
    situasi: data.situasi,
    analisa: data.analisa,
    risiko: data.risiko,
    rekomendasi: data.rekomendasi,
    hasilDiharapkan: data.hasil_diharapkan,
    solusi: toSolutions(data.solusi),
    businessHealth: toBusinessHealth(data.business_health),
    modelNote: data.model_note,
    errorDetail: data.error_detail,
    triggerSource: data.trigger_source,
    generatedAt: data.generated_at,
    createdAt: data.created_at,
  };
}
