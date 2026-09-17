import type { SupabaseClient } from "@supabase/supabase-js";

import type { TypedSupabaseClient } from "@/lib/supabase/types";
import { meetsMinLearningSampleSize } from "@/lib/occupancy/campaign-rules";
import type { OccupancyAdsBrief, OccupancyCreativeVariant } from "@/lib/ai/domains/occupancy-ads";

/**
 * Loonars AI Occupancy Ads — pure DB-access repository, mirroring
 * repositories/meta-ads.repository.ts's shape (no business logic here,
 * that lives in features/occupancy-ads/actions and lib/ai/domains/occupancy-ads.ts).
 *
 * NOTE ON `db()` BELOW: every table this file touches (loonars_*) exists
 * only in migrations 0268/0269, which are NOT yet applied to the live
 * database (see those migrations' headers -- applying them needs a
 * separate human go-ahead per root CLAUDE.md). types/database.types.ts is
 * regenerated FROM the live schema (`npm run supabase:types`, see
 * docs/project-memory/DATABASE.md), so it has no knowledge of these tables
 * yet and TypedSupabaseClient's generated overloads reject their names.
 * `db()` is a narrow, mechanical escape hatch for exactly that gap --
 * every query below is still hand-written against the real column names in
 * 0269, and the moment the migration is applied + types are regenerated,
 * this file can drop `db()` and use `supabase` directly with zero other
 * changes needed.
 */
function db(supabase: TypedSupabaseClient): SupabaseClient {
  return supabase as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export async function listOccupancyTargets(supabase: TypedSupabaseClient) {
  const { data, error } = await db(supabase)
    .from("loonars_occupancy_targets")
    .select("*")
    .is("deleted_at", null)
    .order("property_name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface UpsertOccupancyTargetInput {
  id?: string;
  propertyName: string;
  targetOccupancyPct: number;
  criticalOccupancyPct: number;
  maxDailyBudgetIdr: number;
  isActive: boolean;
}

export async function upsertOccupancyTarget(supabase: TypedSupabaseClient, input: UpsertOccupancyTargetInput, employeeId: string) {
  const payload = {
    property_name: input.propertyName,
    target_occupancy_pct: input.targetOccupancyPct,
    critical_occupancy_pct: input.criticalOccupancyPct,
    max_daily_budget_idr: input.maxDailyBudgetIdr,
    is_active: input.isActive,
    updated_by: employeeId,
  };
  if (input.id) {
    const { error } = await db(supabase).from("loonars_occupancy_targets").update(payload).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data, error } = await db(supabase)
    .from("loonars_occupancy_targets")
    .insert({ ...payload, created_by: employeeId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Creative assets
// ---------------------------------------------------------------------------

export async function listCreativeAssets(supabase: TypedSupabaseClient, statusFilter?: string) {
  let query = db(supabase).from("loonars_creative_assets").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (statusFilter) query = query.eq("status", statusFilter);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Only assets in a "usable in a fresh brief" state -- never draft/review/archived. */
export async function listReadyCreativeAssets(supabase: TypedSupabaseClient) {
  const { data, error } = await db(supabase)
    .from("loonars_creative_assets")
    .select("id, filename, tags")
    .is("deleted_at", null)
    .in("status", ["approved", "ready", "active"])
    .order("created_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return data ?? [];
}

export interface InsertCreativeAssetInput {
  filename: string;
  propertyName: string | null;
  tags: string[];
  mediaType: "image" | "video";
  widthPx: number | null;
  heightPx: number | null;
  sizeBytes: number | null;
  storagePath: string;
  publicUrl: string;
}

export async function insertCreativeAsset(supabase: TypedSupabaseClient, input: InsertCreativeAssetInput, employeeId: string) {
  const { data, error } = await db(supabase)
    .from("loonars_creative_assets")
    .insert({
      filename: input.filename,
      property_name: input.propertyName,
      tags: input.tags,
      media_type: input.mediaType,
      width_px: input.widthPx,
      height_px: input.heightPx,
      size_bytes: input.sizeBytes,
      storage_path: input.storagePath,
      public_url: input.publicUrl,
      status: "draft",
      created_by: employeeId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function updateCreativeAssetStatus(supabase: TypedSupabaseClient, id: string, status: string, employeeId: string) {
  const { error } = await db(supabase).from("loonars_creative_assets").update({ status, updated_by: employeeId }).eq("id", id);
  if (error) throw error;
}

export async function renameCreativeAsset(supabase: TypedSupabaseClient, id: string, filename: string, employeeId: string) {
  const { error } = await db(supabase).from("loonars_creative_assets").update({ filename, updated_by: employeeId }).eq("id", id);
  if (error) throw error;
}

export async function updateCreativeAssetTags(supabase: TypedSupabaseClient, id: string, tags: string[], propertyName: string | null, employeeId: string) {
  const { error } = await db(supabase).from("loonars_creative_assets").update({ tags, property_name: propertyName, updated_by: employeeId }).eq("id", id);
  if (error) throw error;
}

export async function getCreativeAsset(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await db(supabase).from("loonars_creative_assets").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export async function softDeleteCreativeAsset(supabase: TypedSupabaseClient, id: string) {
  const { error } = await db(supabase).from("loonars_creative_assets").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

export async function listOccupancyCampaigns(supabase: TypedSupabaseClient) {
  const { data, error } = await db(supabase)
    .from("loonars_occupancy_campaigns")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getOccupancyCampaign(supabase: TypedSupabaseClient, id: string) {
  const { data, error } = await db(supabase).from("loonars_occupancy_campaigns").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

export interface InsertDraftCampaignInput {
  targetId: string | null;
  propertyName: string;
  brief: OccupancyAdsBrief;
  /** Already clamped to the admin ceiling -- see resolveLaunchBudgetIdr in lib/ai/domains/occupancy-ads.ts. Never the brief's raw AI figure. */
  dailyBudgetIdr: number;
}

/** Step 1 of the two-step flow: persists the AI's research/draft output as a 'draft' row. No Meta call, no spend. */
export async function insertDraftCampaignFromBrief(supabase: TypedSupabaseClient, input: InsertDraftCampaignInput, employeeId: string) {
  const { brief } = input;
  const { data: campaign, error } = await db(supabase)
    .from("loonars_occupancy_campaigns")
    .insert({
      target_id: input.targetId,
      property_name: input.propertyName,
      name: `${input.propertyName} — ${brief.headline}`.slice(0, 200),
      objective: brief.campaignObjective,
      target_dates: brief.targetDates,
      target_market: brief.targetMarket,
      audience_persona: brief.audiencePersona,
      creative_angle: brief.creativeAngle,
      offer: brief.offer,
      daily_budget_idr: input.dailyBudgetIdr,
      duration_days: brief.durationDays,
      headline: brief.headline,
      primary_text: brief.primaryText,
      description: brief.description,
      cta: brief.cta,
      destination_url: brief.destinationUrl,
      status: "draft",
      launched_by: "ai",
      created_by: employeeId,
    })
    .select("id")
    .single();
  if (error) throw error;

  const { error: briefError } = await db(supabase).from("loonars_campaign_briefs").insert({
    campaign_id: campaign.id,
    raw_ai_response: brief as unknown as Record<string, unknown>,
    campaign_objective: brief.campaignObjective,
    target_dates: brief.targetDates,
    target_market: brief.targetMarket,
    audience_persona: brief.audiencePersona,
    creative_angle: brief.creativeAngle,
    offer: brief.offer,
    recommended_budget_idr_raw: brief.recommendedDailyBudgetIdrRaw,
    duration_days: brief.durationDays,
    primary_text: brief.primaryText,
    headline: brief.headline,
    description: brief.description,
    cta: brief.cta,
    destination_url: brief.destinationUrl,
    selected_asset_ids: brief.selectedAssetIds,
    reasoning: brief.reasoning,
    confidence: brief.confidence,
    created_by: employeeId,
  });
  if (briefError) throw briefError;

  return campaign.id as string;
}

export async function updateCampaignStatus(supabase: TypedSupabaseClient, id: string, status: string, employeeId: string) {
  const { error } = await db(supabase).from("loonars_occupancy_campaigns").update({ status, updated_by: employeeId }).eq("id", id);
  if (error) throw error;
}

export interface LaunchedCampaignMetaIds {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
}

export async function markCampaignLaunched(supabase: TypedSupabaseClient, id: string, ids: LaunchedCampaignMetaIds, employeeId: string) {
  const { error } = await db(supabase)
    .from("loonars_occupancy_campaigns")
    .update({
      meta_campaign_id: ids.campaignId,
      meta_adset_id: ids.adSetId,
      meta_creative_id: ids.creativeId,
      meta_ad_id: ids.adId,
      status: "active",
      launched_by: "human",
      launched_at: new Date().toISOString(),
      updated_by: employeeId,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function markCampaignFailed(supabase: TypedSupabaseClient, id: string, reason: string, employeeId: string) {
  const { error } = await db(supabase)
    .from("loonars_occupancy_campaigns")
    .update({ status: "failed", failure_reason: reason, updated_by: employeeId })
    .eq("id", id);
  if (error) throw error;
}

export async function softDeleteDraftCampaign(supabase: TypedSupabaseClient, id: string) {
  const { error } = await db(supabase)
    .from("loonars_occupancy_campaigns")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "review", "failed"]);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Recommendations (Campaign Decision Engine -- lib/occupancy/decision-engine.ts)
// ---------------------------------------------------------------------------

export async function insertCampaignRecommendation(
  supabase: TypedSupabaseClient,
  campaignId: string,
  recommendation: "scale" | "maintain" | "reduce" | "pause",
  reasoning: string,
  metricsSnapshot: Record<string, unknown>,
) {
  const { error } = await db(supabase).from("loonars_campaign_recommendations").insert({
    campaign_id: campaignId,
    recommendation,
    reasoning,
    metrics_snapshot: metricsSnapshot as never,
  });
  if (error) throw error;
}

export async function listCampaignRecommendations(supabase: TypedSupabaseClient, campaignId: string) {
  const { data, error } = await db(supabase)
    .from("loonars_campaign_recommendations")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

/** The immediately-previous recommendation's metrics_snapshot -- the Decision Engine's ONLY source of "what was the trend last time", never re-derived from anything else. Null when this is the first check for this campaign. */
export async function getPreviousCampaignRecommendationSnapshot(supabase: TypedSupabaseClient, campaignId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db(supabase)
    .from("loonars_campaign_recommendations")
    .select("metrics_snapshot")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.metrics_snapshot as Record<string, unknown> | null) ?? null;
}

export async function markRecommendationApplied(supabase: TypedSupabaseClient, id: string, employeeId: string) {
  const { error } = await db(supabase)
    .from("loonars_campaign_recommendations")
    .update({ applied: true, applied_at: new Date().toISOString(), applied_by: employeeId })
    .eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Creative variants
// ---------------------------------------------------------------------------

export async function listCreativeVariantsForCampaign(supabase: TypedSupabaseClient, campaignId: string) {
  const { data, error } = await db(supabase)
    .from("loonars_creative_variants")
    .select("*")
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function insertCreativeVariants(supabase: TypedSupabaseClient, campaignId: string, variants: OccupancyCreativeVariant[], employeeId: string) {
  const { data, error } = await db(supabase)
    .from("loonars_creative_variants")
    .insert(
      variants.map((v) => ({
        asset_id: v.assetId,
        campaign_id: campaignId,
        format: v.format,
        generated_headline: v.generatedHeadline,
        generated_primary_text: v.generatedPrimaryText,
        approval_state: "pending",
        created_by: employeeId,
      })),
    )
    .select("id");
  if (error) throw error;
  return (data ?? []).map((r) => r.id as string);
}

export async function updateCreativeVariantApprovalState(supabase: TypedSupabaseClient, id: string, approvalState: "pending" | "approved" | "rejected", employeeId: string) {
  const { error } = await db(supabase).from("loonars_creative_variants").update({ approval_state: approvalState, updated_by: employeeId }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Ad Preview support -- copy regeneration + primary asset selection
// ---------------------------------------------------------------------------

/** Overwrites the campaign row's editable copy fields from a freshly re-generated brief (regenerate-copy action on the Meta Ad Preview) -- the brief row itself is still inserted separately (insertCampaignBriefOnly) so the previous AI output is never lost. */
export async function updateCampaignCopyFromBrief(supabase: TypedSupabaseClient, id: string, brief: OccupancyAdsBrief, employeeId: string) {
  const { error } = await db(supabase)
    .from("loonars_occupancy_campaigns")
    .update({
      headline: brief.headline,
      primary_text: brief.primaryText,
      description: brief.description,
      cta: brief.cta,
      creative_angle: brief.creativeAngle,
      offer: brief.offer,
      updated_by: employeeId,
    })
    .eq("id", id);
  if (error) throw error;
}

/** Persists a re-generated brief's raw AI output as its own loonars_campaign_briefs row (history), without touching loonars_occupancy_campaigns -- callers pair this with updateCampaignCopyFromBrief. */
export async function insertCampaignBriefOnly(supabase: TypedSupabaseClient, campaignId: string, brief: OccupancyAdsBrief, employeeId: string) {
  const { error } = await db(supabase).from("loonars_campaign_briefs").insert({
    campaign_id: campaignId,
    raw_ai_response: brief as unknown as Record<string, unknown>,
    campaign_objective: brief.campaignObjective,
    target_dates: brief.targetDates,
    target_market: brief.targetMarket,
    audience_persona: brief.audiencePersona,
    creative_angle: brief.creativeAngle,
    offer: brief.offer,
    recommended_budget_idr_raw: brief.recommendedDailyBudgetIdrRaw,
    duration_days: brief.durationDays,
    primary_text: brief.primaryText,
    headline: brief.headline,
    description: brief.description,
    cta: brief.cta,
    destination_url: brief.destinationUrl,
    selected_asset_ids: brief.selectedAssetIds,
    reasoning: brief.reasoning,
    confidence: brief.confidence,
    created_by: employeeId,
  });
  if (error) throw error;
}

/** Sets which single creative asset is "the" one shown in the Meta Ad Preview / used on launch (migration 0270's primary_asset_id) -- null clears it (e.g. the asset was archived). */
export async function setCampaignPrimaryAsset(supabase: TypedSupabaseClient, id: string, assetId: string | null, employeeId: string) {
  const { error } = await db(supabase).from("loonars_occupancy_campaigns").update({ primary_asset_id: assetId, updated_by: employeeId }).eq("id", id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Learnings
// ---------------------------------------------------------------------------

export interface LearningAggregate {
  market: string;
  persona: string;
  creativeAngle: string;
  avgCac: number | null;
  avgCtr: number | null;
  sampleSize: number;
}

/**
 * Aggregates loonars_campaign_learnings by market+persona+creative_angle,
 * returning ONLY combinations that meet MIN_LEARNING_SAMPLE_SIZE -- the
 * minimum-sample-size rule enforced in code (lib/occupancy/campaign-rules.ts),
 * not just documented. A combination with fewer completed campaigns than
 * that is simply omitted, never surfaced as if it were reliable.
 */
export async function listReliableLearnings(supabase: TypedSupabaseClient): Promise<LearningAggregate[]> {
  const { data, error } = await db(supabase)
    .from("loonars_campaign_learnings")
    .select("market, persona, creative_angle, cac_idr, ctr_pct")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;

  const groups = new Map<string, { market: string; persona: string; creativeAngle: string; cacs: number[]; ctrs: number[] }>();
  for (const row of data ?? []) {
    const angle = row.creative_angle ?? "";
    const key = `${row.market}::${row.persona}::${angle}`;
    if (!groups.has(key)) groups.set(key, { market: row.market, persona: row.persona, creativeAngle: angle, cacs: [], ctrs: [] });
    const g = groups.get(key)!;
    if (typeof row.cac_idr === "number") g.cacs.push(row.cac_idr);
    if (typeof row.ctr_pct === "number") g.ctrs.push(row.ctr_pct);
  }

  const avg = (nums: number[]) => (nums.length > 0 ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : null);

  return Array.from(groups.values())
    .filter((g) => meetsMinLearningSampleSize(Math.max(g.cacs.length, g.ctrs.length)))
    .map((g) => ({
      market: g.market,
      persona: g.persona,
      creativeAngle: g.creativeAngle,
      avgCac: avg(g.cacs),
      avgCtr: avg(g.ctrs),
      sampleSize: Math.max(g.cacs.length, g.ctrs.length),
    }));
}

export async function insertCampaignLearning(
  supabase: TypedSupabaseClient,
  input: {
    campaignId: string | null;
    market: string;
    persona: string;
    creativeAngle: string | null;
    offer: string | null;
    budgetIdr: number | null;
    spendIdr: number | null;
    cacIdr: number | null;
    ctrPct: number | null;
    conversions: number | null;
    outcomeNotes: string | null;
  },
) {
  const { error } = await db(supabase).from("loonars_campaign_learnings").insert({
    campaign_id: input.campaignId,
    market: input.market,
    persona: input.persona,
    creative_angle: input.creativeAngle,
    offer: input.offer,
    budget_idr: input.budgetIdr,
    spend_idr: input.spendIdr,
    cac_idr: input.cacIdr,
    ctr_pct: input.ctrPct,
    conversions: input.conversions,
    outcome_notes: input.outcomeNotes,
  });
  if (error) throw error;
}
