import type { TypedSupabaseClient } from "@/lib/supabase/types";

/**
 * Real Gemini Vision queue state, read straight from kontenai_assets.
 *
 * Exists because the /kontenai/gemini-vision page was previously backed by
 * features/kontenai/lib/mock-db.ts -- an in-memory prototype store whose
 * "Analisis Semua" button wrote deterministic fake analysis text and never
 * touched the real table. Anyone reading that page concluded their footage
 * was analyzed when none of it was.
 */

export type VisionStatus = "not_analyzed" | "pending" | "completed" | "failed";

export interface VisionStatusCounts {
  total: number;
  notAnalyzed: number;
  pending: number;
  completed: number;
  failed: number;
  /** Per brand, so it is obvious whether the two automated focuses (occupancy, beauty) are actually ready. */
  byCompany: { company: string; total: number; completed: number }[];
}

export interface VisionQueueAsset {
  id: string;
  title: string;
  assetType: string;
  company: string | null;
  status: VisionStatus;
  error: string | null;
  analyzedAt: string | null;
  createdAt: string;
}

export async function getVisionStatusCounts(supabase: TypedSupabaseClient): Promise<VisionStatusCounts> {
  const { data, error } = await supabase
    .from("kontenai_assets")
    .select("ai_vision_status, company")
    .is("deleted_at", null);
  if (error) throw error;

  const counts: VisionStatusCounts = {
    total: 0,
    notAnalyzed: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    byCompany: [],
  };
  const perCompany = new Map<string, { total: number; completed: number }>();

  for (const row of data ?? []) {
    counts.total++;
    switch (row.ai_vision_status) {
      case "completed":
        counts.completed++;
        break;
      case "pending":
        counts.pending++;
        break;
      case "failed":
        counts.failed++;
        break;
      default:
        counts.notAnalyzed++;
    }

    const key = row.company ?? "(tanpa brand)";
    const bucket = perCompany.get(key) ?? { total: 0, completed: 0 };
    bucket.total++;
    if (row.ai_vision_status === "completed") bucket.completed++;
    perCompany.set(key, bucket);
  }

  counts.byCompany = [...perCompany.entries()]
    .map(([company, v]) => ({ company, ...v }))
    .sort((a, b) => b.total - a.total);

  return counts;
}

/** Assets still waiting or failed — the only rows worth showing, oldest first (that is queue order). */
export async function listVisionOutstanding(supabase: TypedSupabaseClient, limit = 40): Promise<VisionQueueAsset[]> {
  const { data, error } = await supabase
    .from("kontenai_assets")
    .select("id, title, asset_type, company, ai_vision_status, ai_error, ai_analyzed_at, created_at")
    .is("deleted_at", null)
    .in("ai_vision_status", ["not_analyzed", "pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    assetType: row.asset_type,
    company: row.company,
    status: row.ai_vision_status as VisionStatus,
    error: row.ai_error,
    analyzedAt: row.ai_analyzed_at,
    createdAt: row.created_at,
  }));
}
