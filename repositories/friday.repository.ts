import type { TypedSupabaseClient } from "@/lib/supabase/types";
import type { FridayActionStatusDb, FridayBriefingStatusDb, FridayRiskTierDb, FridaySeverityDb, Json } from "@/types/database.types";

/**
 * Queries behind /friday — the FRIDAY executive intelligence console.
 *
 * Read-only throughout. Briefings are written by the AI job processor and
 * actions are transitioned by server actions running with the service-role
 * client; nothing in this file writes, and the RLS policies in migration 0179
 * grant no insert/update to any client role at all.
 */

export interface FridaySolutionView {
  judul: string;
  ringkasan: string;
  keuntungan: string;
  kerugian: string;
  biaya_estimasi: string;
  dampak: string;
}

export interface FridayActionView {
  id: string;
  actionKey: string;
  title: string;
  rationale: string;
  riskTier: FridayRiskTierDb;
  status: FridayActionStatusDb;
  payload: Record<string, unknown>;
  decidedAt: string | null;
  executedAt: string | null;
  executionNote: string | null;
}

export interface FridayBriefingView {
  id: string;
  status: FridayBriefingStatusDb;
  severity: FridaySeverityDb | null;
  headline: string | null;
  situasi: string | null;
  analisa: string | null;
  risiko: string | null;
  solusi: FridaySolutionView[];
  rekomendasi: string | null;
  hasilDiharapkan: string | null;
  modelNote: string | null;
  errorDetail: string | null;
  triggerSource: string;
  generatedAt: string | null;
  createdAt: string;
  actions: FridayActionView[];
}

export interface FridayBriefingSummary {
  id: string;
  status: FridayBriefingStatusDb;
  severity: FridaySeverityDb | null;
  headline: string | null;
  triggerSource: string;
  createdAt: string;
  generatedAt: string | null;
}

const BRIEFING_COLUMNS =
  "id, status, severity, headline, situasi, analisa, risiko, solusi, rekomendasi, hasil_diharapkan, model_note, error_detail, trigger_source, generated_at, created_at";

/** `solusi` is jsonb, so it is whatever was written — shaped defensively here so one malformed entry cannot throw during render. */
function toSolutions(raw: Json): FridaySolutionView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const item = entry as Record<string, unknown>;
    const judul = typeof item.judul === "string" ? item.judul : "";
    if (!judul) return [];
    const text = (key: string) => (typeof item[key] === "string" ? (item[key] as string) : "—");
    return [
      {
        judul,
        ringkasan: text("ringkasan"),
        keuntungan: text("keuntungan"),
        kerugian: text("kerugian"),
        biaya_estimasi: text("biaya_estimasi"),
        dampak: text("dampak"),
      },
    ];
  });
}

function toActions(rows: { id: string; action_key: string; title: string; rationale: string; risk_tier: FridayRiskTierDb; status: FridayActionStatusDb; payload: Json; decided_at: string | null; executed_at: string | null; execution_note: string | null }[]): FridayActionView[] {
  return rows.map((row) => ({
    id: row.id,
    actionKey: row.action_key,
    title: row.title,
    rationale: row.rationale,
    riskTier: row.risk_tier,
    status: row.status,
    payload: typeof row.payload === "object" && row.payload !== null && !Array.isArray(row.payload) ? (row.payload as Record<string, unknown>) : {},
    decidedAt: row.decided_at,
    executedAt: row.executed_at,
    executionNote: row.execution_note,
  }));
}

/** The most recent briefing of any status — including a 'pending' one still being generated, so the console can say "sedang dianalisa" instead of showing yesterday's as if it were today's. */
export async function getLatestBriefing(supabase: TypedSupabaseClient): Promise<FridayBriefingView | null> {
  const { data, error } = await supabase.from("friday_briefings").select(BRIEFING_COLUMNS).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return hydrate(supabase, data);
}

export async function getBriefingById(supabase: TypedSupabaseClient, id: string): Promise<FridayBriefingView | null> {
  const { data, error } = await supabase.from("friday_briefings").select(BRIEFING_COLUMNS).eq("id", id).maybeSingle();
  if (error || !data) return null;
  return hydrate(supabase, data);
}

async function hydrate(
  supabase: TypedSupabaseClient,
  row: {
    id: string;
    status: FridayBriefingStatusDb;
    severity: FridaySeverityDb | null;
    headline: string | null;
    situasi: string | null;
    analisa: string | null;
    risiko: string | null;
    solusi: Json;
    rekomendasi: string | null;
    hasil_diharapkan: string | null;
    model_note: string | null;
    error_detail: string | null;
    trigger_source: string;
    generated_at: string | null;
    created_at: string;
  },
): Promise<FridayBriefingView> {
  const { data: actionRows } = await supabase
    .from("friday_actions")
    .select("id, action_key, title, rationale, risk_tier, status, payload, decided_at, executed_at, execution_note")
    .eq("briefing_id", row.id)
    .order("created_at", { ascending: true });

  return {
    id: row.id,
    status: row.status,
    severity: row.severity,
    headline: row.headline,
    situasi: row.situasi,
    analisa: row.analisa,
    risiko: row.risiko,
    solusi: toSolutions(row.solusi),
    rekomendasi: row.rekomendasi,
    hasilDiharapkan: row.hasil_diharapkan,
    modelNote: row.model_note,
    errorDetail: row.error_detail,
    triggerSource: row.trigger_source,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
    actions: toActions(actionRows ?? []),
  };
}

export async function listRecentBriefings(supabase: TypedSupabaseClient, limit = 12): Promise<FridayBriefingSummary[]> {
  const { data, error } = await supabase
    .from("friday_briefings")
    .select("id, status, severity, headline, trigger_source, created_at, generated_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    status: row.status,
    severity: row.severity,
    headline: row.headline,
    triggerSource: row.trigger_source,
    createdAt: row.created_at,
    generatedAt: row.generated_at,
  }));
}
