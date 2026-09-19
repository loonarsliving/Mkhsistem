"use server";

import { revalidatePath } from "next/cache";

import { askOccupancyCopilot, generateOccupancyAdsBrief, generateOccupancyCreativeVariants, resolveLaunchBudgetIdr } from "@/lib/ai/domains/occupancy-ads";
import { decideCampaignAction, type DecisionEngineMetaInsights } from "@/lib/occupancy/decision-engine";
import { checkWeeklyBudgetCeiling, isAllowedOccupancyDestinationUrl, type OccupancyPersona } from "@/lib/occupancy/campaign-rules";
import { classifyOccupancyCalendar, classifyOccupancyDay, selectAdvertisableDates, summarizeGap, type OccupancyThresholds } from "@/lib/occupancy/gap-engine";
import { getOccupancyProvider } from "@/lib/occupancy/villa-provider";
import { isMetaConfigured } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/client";
import { getAdInsights, getAdReviewStatus, getLeaseholdTargetGeoLocations, launchLinkClickCampaign, resolveGeoLocationsFromNames } from "@/lib/meta/ads";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveWeeklyCommittedBudgetIdr,
  getCreativeAsset,
  getOccupancyCampaign,
  getPreviousCampaignRecommendationSnapshot,
  insertCampaignBriefOnly,
  insertCampaignLearning,
  insertCampaignRecommendation,
  insertCreativeAsset,
  insertCreativeVariants,
  insertDraftCampaignFromBrief,
  listCampaignRecommendations,
  listCreativeAssets,
  listCreativeVariantsForCampaign,
  listOccupancyCampaigns,
  listOccupancyTargets,
  listReadyCreativeAssets,
  listReliableLearnings,
  markCampaignFailed,
  markCampaignLaunched,
  markRecommendationApplied,
  renameCreativeAsset,
  setCampaignPrimaryAsset,
  softDeleteCreativeAsset,
  softDeleteDraftCampaign,
  updateCampaignCopyFromBrief,
  updateCampaignCopyManual,
  updateCampaignStatus,
  updateCreativeAssetStatus,
  updateCreativeAssetTags,
  updateCreativeVariantApprovalState,
  upsertOccupancyTarget,
  type InsertCreativeAssetInput,
  type UpsertOccupancyTargetInput,
} from "@/repositories/occupancy-ads.repository";
import { actionError, actionSuccess, type ActionResult } from "@/types/domain";

// ---------------------------------------------------------------------------
// Occupancy calendar (read-only, no DB write -- always live from villa-api)
// ---------------------------------------------------------------------------

export interface OccupancyCalendarResult {
  ok: boolean;
  reason?: string;
  days?: ReturnType<typeof classifyOccupancyCalendar>;
  gapSummary?: ReturnType<typeof summarizeGap>;
}

/** Read-only occupancy calendar for the dashboard -- never fabricates data; returns { ok: false, reason } verbatim from the provider when villa-api is unavailable (spec §43). */
export async function getOccupancyCalendarAction(propertyName: string, startDate: string, endDateExclusive: string): Promise<OccupancyCalendarResult> {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();

  const targets = await listOccupancyTargets(supabase);
  const target = targets.find((t) => t.property_name === propertyName && t.is_active);
  if (!target) {
    return { ok: false, reason: `Belum ada target okupansi aktif untuk "${propertyName}". Atur dulu di halaman Target.` };
  }

  const provider = getOccupancyProvider();
  const result = await provider.getForwardAvailability(startDate, endDateExclusive);
  if (!result.ok) return { ok: false, reason: result.reason };

  const thresholds: OccupancyThresholds = { targetOccupancyPct: Number(target.target_occupancy_pct), criticalOccupancyPct: Number(target.critical_occupancy_pct) };
  const days = classifyOccupancyCalendar(result.data, thresholds);
  const gapSummary = summarizeGap(days);
  return { ok: true, days, gapSummary };
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export async function listOccupancyTargetsAction() {
  const session = await requirePermission("occupancy_ads.view");
  void session;
  const supabase = await createClient();
  return listOccupancyTargets(supabase);
}

export async function saveOccupancyTargetAction(input: UpsertOccupancyTargetInput): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  if (input.targetOccupancyPct <= 0 || input.targetOccupancyPct > 100) return actionError("Target okupansi harus antara 0-100%");
  if (input.criticalOccupancyPct < input.targetOccupancyPct) return actionError("Ambang kritis harus >= target okupansi");
  if (input.maxDailyBudgetIdr < 0) return actionError("Plafon budget harian tidak boleh negatif");
  if (input.maxWeeklyBudgetIdr !== null && input.maxWeeklyBudgetIdr < 0) return actionError("Plafon budget mingguan tidak boleh negatif");
  if (input.maxWeeklyBudgetIdr !== null && input.maxWeeklyBudgetIdr > 0 && input.maxWeeklyBudgetIdr < input.maxDailyBudgetIdr) {
    return actionError("Plafon budget mingguan tidak boleh lebih kecil dari plafon budget harian");
  }

  const supabase = await createClient();
  try {
    await upsertOccupancyTarget(supabase, input, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan target okupansi");
  }
  revalidatePath("/occupancy-ads/targets");
  return actionSuccess();
}

// ---------------------------------------------------------------------------
// Creative Asset Library
// ---------------------------------------------------------------------------

export async function listCreativeAssetsAction(statusFilter?: string) {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();
  return listCreativeAssets(supabase, statusFilter);
}

/** Records a row for a file already uploaded client-side to the occupancy-ads-assets bucket (uploadEntityFile, mirroring how features/kontenai/asset-library does it) -- this action never touches Storage itself, only the DB row. */
export async function recordCreativeAssetAction(input: InsertCreativeAssetInput): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    const id = await insertCreativeAsset(supabase, input, session.employee.id);
    revalidatePath("/occupancy-ads/assets");
    return actionSuccess({ id });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan aset kreatif");
  }
}

export async function updateCreativeAssetStatusAction(id: string, status: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCreativeAssetStatus(supabase, id, status, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah status aset");
  }
  revalidatePath("/occupancy-ads/assets");
  return actionSuccess();
}

export async function updateCreativeAssetTagsAction(id: string, tags: string[], propertyName: string | null): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCreativeAssetTags(supabase, id, tags, propertyName, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah tag aset");
  }
  revalidatePath("/occupancy-ads/assets");
  return actionSuccess();
}

export async function renameCreativeAssetAction(id: string, filename: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  if (!filename.trim()) return actionError("Nama file tidak boleh kosong");
  const supabase = await createClient();
  try {
    await renameCreativeAsset(supabase, id, filename.trim().slice(0, 255), session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah nama aset");
  }
  revalidatePath("/occupancy-ads/assets");
  return actionSuccess();
}

export async function deleteCreativeAssetAction(id: string): Promise<ActionResult> {
  await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await softDeleteCreativeAsset(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus aset");
  }
  revalidatePath("/occupancy-ads/assets");
  return actionSuccess();
}

// ---------------------------------------------------------------------------
// Step 1: AI research/draft — no Meta spend
// ---------------------------------------------------------------------------

export async function requestOccupancyAdsBriefAction(targetId: string): Promise<ActionResult<{ campaignId: string }>> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  const targets = await listOccupancyTargets(supabase);
  const target = targets.find((t) => t.id === targetId);
  if (!target) return actionError("Target okupansi tidak ditemukan");
  if (target.max_daily_budget_idr <= 0) {
    return actionError("Plafon budget harian untuk properti ini belum diatur (0) -- atur dulu di halaman Target sebelum meminta riset AI.");
  }

  const provider = getOccupancyProvider();
  const today = new Date();
  const startDate = today.toISOString().slice(0, 10);
  const endDate = new Date(today.getTime() + 21 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const calendarResult = await provider.getForwardAvailability(startDate, endDate);
  if (!calendarResult.ok) {
    return actionError(`Data okupansi villa-api tidak tersedia: ${calendarResult.reason}. Riset AI dihentikan -- tidak akan memakai data perkiraan/palsu.`);
  }

  const thresholds: OccupancyThresholds = { targetOccupancyPct: Number(target.target_occupancy_pct), criticalOccupancyPct: Number(target.critical_occupancy_pct) };
  const classified = classifyOccupancyCalendar(calendarResult.data, thresholds);
  const lowDates = selectAdvertisableDates(classified);
  if (lowDates.length === 0) {
    return actionError("Tidak ada tanggal dengan okupansi LOW dalam 21 hari ke depan -- tidak perlu campaign baru saat ini.");
  }
  const gapSummary = summarizeGap(classified);

  const assets = await listReadyCreativeAssets(supabase);
  const reliableLearnings = await listReliableLearnings(supabase);

  let brief;
  try {
    brief = await generateOccupancyAdsBrief({
      propertyName: target.property_name,
      gapSummary,
      lowDates: lowDates.map((d) => ({ date: d.date, occupancyPct: d.occupancyPct, availableUnits: d.availableUnits })),
      maxDailyBudgetIdr: target.max_daily_budget_idr,
      availableAssets: assets.map((a) => ({ id: a.id, filename: a.filename, tags: a.tags ?? [] })),
      reliableLearnings,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "AI gagal membuat brief campaign");
  }

  const dailyBudgetIdr = resolveLaunchBudgetIdr(brief, target.max_daily_budget_idr);

  let campaignId: string;
  try {
    campaignId = await insertDraftCampaignFromBrief(supabase, { targetId: target.id, propertyName: target.property_name, brief, dailyBudgetIdr }, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan draft campaign");
  }

  revalidatePath("/occupancy-ads");
  return actionSuccess({ campaignId });
}

export async function listOccupancyCampaignsAction() {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();
  return listOccupancyCampaigns(supabase);
}

export async function moveOccupancyCampaignToReviewAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCampaignStatus(supabase, id, "review", session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal memindahkan campaign ke review");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

export async function approveOccupancyCampaignAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCampaignStatus(supabase, id, "approved", session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyetujui campaign");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

/** Meta Ad Preview's "Reject" action -- distinct from deleteOccupancyCampaignDraftAction (hard soft-delete) and markCampaignFailed (a real Meta API failure): a human reviewing the draft/review copy decided not to move forward with it, migration 0270's 'rejected' status. */
export async function rejectOccupancyCampaignAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCampaignStatus(supabase, id, "rejected", session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menolak campaign");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

export async function deleteOccupancyCampaignDraftAction(id: string): Promise<ActionResult> {
  await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await softDeleteDraftCampaign(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menghapus draft campaign");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

// ---------------------------------------------------------------------------
// Step 2: explicit human-confirmed launch — real Meta spend
// ---------------------------------------------------------------------------

/**
 * Explicit human confirmation to actually spend real money. Mirrors
 * launchDraftCampaignAction (features/markom/actions/ads.actions.ts):
 * re-validates everything server-side (status, destination URL, budget
 * ceiling) rather than trusting the client, and never calls Meta for a
 * campaign not already 'approved' by a human. Default automation mode is
 * ASSISTED (spec §41) -- there is no code path anywhere in this module
 * that reaches launchLinkClickCampaign without this explicit action.
 */
export async function launchOccupancyCampaignAction(id: string, mediaUrls: string[], mediaType: "image" | "video"): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  if (!isMetaConfigured()) {
    return actionError("Meta integration belum dikonfigurasi (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID)");
  }

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }
  if (campaign.status !== "approved" && campaign.status !== "ready_for_meta") {
    return actionError("Hanya campaign berstatus 'approved' yang bisa diluncurkan -- review dan setujui dulu.");
  }
  if (!isAllowedOccupancyDestinationUrl(campaign.destination_url)) {
    return actionError(`Destination URL "${campaign.destination_url}" tidak diizinkan -- hanya https://loonars.id (atau halaman di bawahnya) yang boleh dituju.`);
  }
  if (mediaUrls.length === 0) return actionError("Pilih minimal satu aset kreatif untuk diluncurkan");

  const targets = await listOccupancyTargets(supabase);
  const target = targets.find((t) => t.id === campaign.target_id);
  const maxDailyBudgetIdr = target?.max_daily_budget_idr ?? 0;
  if (maxDailyBudgetIdr <= 0) {
    return actionError("Plafon budget harian untuk properti ini tidak ditemukan/0 -- tidak bisa meluncurkan tanpa plafon yang valid.");
  }
  const dailyBudgetIdr = Math.min(campaign.daily_budget_idr, maxDailyBudgetIdr);

  const alreadyCommittedWeeklyIdr = target ? await getActiveWeeklyCommittedBudgetIdr(supabase, target.id, campaign.id) : 0;
  const weeklyCheck = checkWeeklyBudgetCeiling(alreadyCommittedWeeklyIdr, dailyBudgetIdr, target?.max_weekly_budget_idr ?? null);
  if (!weeklyCheck.allowed) {
    return actionError(
      `Melebihi plafon budget mingguan untuk properti ini: campaign aktif minggu ini sudah Rp${alreadyCommittedWeeklyIdr.toLocaleString("id-ID")}/hari total, ` +
        `ditambah campaign ini Rp${dailyBudgetIdr.toLocaleString("id-ID")}/hari akan jadi Rp${weeklyCheck.wouldBeTotalIdr.toLocaleString("id-ID")}, ` +
        `melebihi plafon mingguan Rp${(target?.max_weekly_budget_idr ?? 0).toLocaleString("id-ID")}. Jeda campaign lain atau naikkan plafon mingguan dulu.`,
    );
  }

  try {
    const result = await launchLinkClickCampaign({
      campaignName: campaign.name,
      photoUrls: mediaType === "image" ? mediaUrls : [],
      videoUrl: mediaType === "video" ? mediaUrls[0] : undefined,
      headline: campaign.headline ?? campaign.name,
      primaryText: campaign.primary_text ?? "",
      description: campaign.description ?? undefined,
      destinationUrl: campaign.destination_url,
      cta: campaign.cta ?? undefined,
      dailyBudgetIdr,
      targeting: await resolveGeoLocationsFromNames([campaign.target_market], 30).catch(() => getLeaseholdTargetGeoLocations()),
    });
    await markCampaignLaunched(supabase, id, result, session.employee.id);
  } catch (err) {
    const reason = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "Meta API call failed";
    await markCampaignFailed(supabase, id, reason, session.employee.id);
    revalidatePath("/occupancy-ads");
    return actionError(`Gagal meluncurkan campaign: ${reason}`);
  }

  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

export async function pauseOccupancyCampaignAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCampaignStatus(supabase, id, "paused", session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menjeda campaign");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

/**
 * Meta's own review/delivery status for an already-launched campaign --
 * distinct from our local campaign.status ("Aktif" here only means our
 * launch API call succeeded, not that Meta has finished reviewing it or
 * started actually delivering it). Read-only, no DB write; the admin
 * triggers this on demand rather than it being auto-polled, since Meta
 * review can take minutes to ~24h and there's no automation dispatch for
 * this module yet.
 */
export async function getOccupancyCampaignMetaStatusAction(campaignId: string): Promise<ActionResult<{ effectiveStatus: string; configuredStatus: string; rejectionReasons: string[] }>> {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();

  if (!isMetaConfigured()) {
    return actionError("Meta integration belum dikonfigurasi");
  }

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, campaignId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }
  if (!campaign.meta_ad_id) {
    return actionError("Campaign ini belum pernah diluncurkan ke Meta -- belum ada status review untuk dicek.");
  }

  try {
    const status = await getAdReviewStatus(campaign.meta_ad_id);
    return actionSuccess(status);
  } catch (err) {
    const reason = err instanceof MetaApiError ? err.message : err instanceof Error ? err.message : "Gagal mengambil status dari Meta";
    return actionError(reason);
  }
}

/** Records a completed campaign's real outcome as a learning row -- feeds listReliableLearnings for future briefs once enough samples accumulate (MIN_LEARNING_SAMPLE_SIZE). */
export async function completeOccupancyCampaignAction(
  id: string,
  outcome: { spendIdr: number; cacIdr: number | null; ctrPct: number | null; conversions: number | null; notes: string | null },
): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }

  try {
    await updateCampaignStatus(supabase, id, "completed", session.employee.id);
    await insertCampaignLearning(supabase, {
      campaignId: id,
      market: campaign.target_market,
      persona: campaign.audience_persona,
      creativeAngle: campaign.creative_angle,
      offer: campaign.offer,
      budgetIdr: campaign.daily_budget_idr,
      spendIdr: outcome.spendIdr,
      cacIdr: outcome.cacIdr,
      ctrPct: outcome.ctrPct,
      conversions: outcome.conversions,
      outcomeNotes: outcome.notes,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan hasil campaign");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

// ---------------------------------------------------------------------------
// Occupancy AI Copilot ("Ask Occupancy AI", spec §38)
// ---------------------------------------------------------------------------

export async function askOccupancyCopilotAction(question: string): Promise<ActionResult<{ answer: string; dataGap: boolean }>> {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();

  const campaigns = await listOccupancyCampaigns(supabase);
  const activeCampaignsSummary = campaigns
    .filter((c) => c.status === "active" || c.status === "paused")
    .map((c) => `${c.name} (${c.status}): pasar ${c.target_market}, budget harian Rp${c.daily_budget_idr.toLocaleString("id-ID")}, spend Rp${(c.spend_idr ?? 0).toLocaleString("id-ID")}`);
  const learnings = await listReliableLearnings(supabase);
  const recentLearningsSummary = learnings.map((l) => `pasar ${l.market}, persona ${l.persona}: CAC rata-rata ${l.avgCac ?? "n/a"}, CTR ${l.avgCtr ?? "n/a"}% (n=${l.sampleSize})`);

  const targets = await listOccupancyTargets(supabase);
  const activeTarget = targets.find((t) => t.is_active);
  let gapSummary = { totalDays: 0, lowDays: 0, healthyDays: 0, highDays: 0, fullDays: 0, averageOccupancyPct: 0, averageGapPct: 0 };
  if (activeTarget) {
    const provider = getOccupancyProvider();
    const today = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const calendarResult = await provider.getForwardAvailability(today, end);
    if (calendarResult.ok) {
      const thresholds: OccupancyThresholds = { targetOccupancyPct: Number(activeTarget.target_occupancy_pct), criticalOccupancyPct: Number(activeTarget.critical_occupancy_pct) };
      gapSummary = summarizeGap(classifyOccupancyCalendar(calendarResult.data, thresholds));
    }
  }

  try {
    const answer = await askOccupancyCopilot({ question, gapSummary, activeCampaignsSummary, recentLearningsSummary });
    return actionSuccess(answer);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "AI Copilot gagal menjawab");
  }
}

// ---------------------------------------------------------------------------
// Creative variant generation (spec: 1-3 per brief, default 3) -- pairs a
// real asset with an angle/hook, never fabricates an image (see
// lib/ai/domains/occupancy-ads.ts's generateOccupancyCreativeVariants).
// ---------------------------------------------------------------------------

export async function listCreativeVariantsAction(campaignId: string) {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();
  return listCreativeVariantsForCampaign(supabase, campaignId);
}

export async function generateCreativeVariantsAction(campaignId: string, variantCount?: number): Promise<ActionResult<{ variantIds: string[] }>> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, campaignId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }

  const assets = await listReadyCreativeAssets(supabase);
  if (assets.length === 0) {
    return actionError("Belum ada aset kreatif siap pakai (status approved/ready/active) -- unggah dan setujui aset dulu di Creative Asset Library.");
  }

  let variants;
  try {
    variants = await generateOccupancyCreativeVariants({
      campaignObjective: campaign.objective as Parameters<typeof generateOccupancyCreativeVariants>[0]["campaignObjective"],
      targetMarket: campaign.target_market as Parameters<typeof generateOccupancyCreativeVariants>[0]["targetMarket"],
      audiencePersona: campaign.audience_persona as Parameters<typeof generateOccupancyCreativeVariants>[0]["audiencePersona"],
      offer: campaign.offer ?? "",
      availableAssets: assets.map((a) => ({ id: a.id, filename: a.filename, tags: a.tags ?? [] })),
      variantCount,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "AI gagal membuat varian kreatif");
  }

  let variantIds: string[];
  try {
    variantIds = await insertCreativeVariants(supabase, campaignId, variants, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan varian kreatif");
  }

  revalidatePath("/occupancy-ads");
  return actionSuccess({ variantIds });
}

/** "Create a variation" on the Meta Ad Preview -- a single extra variant on top of whatever already exists for this campaign. */
export async function createSingleCreativeVariationAction(campaignId: string): Promise<ActionResult<{ variantIds: string[] }>> {
  return generateCreativeVariantsAction(campaignId, 1);
}

export async function approveCreativeVariantAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCreativeVariantApprovalState(supabase, id, "approved", session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyetujui varian");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

export async function rejectCreativeVariantAction(id: string): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();
  try {
    await updateCreativeVariantApprovalState(supabase, id, "rejected", session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menolak varian");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

// ---------------------------------------------------------------------------
// Meta Ad Preview support -- regenerate copy, change primary asset
// ---------------------------------------------------------------------------

/** "Regenerate copy" on the Meta Ad Preview: re-runs the same AI brief generator against the campaign's already-fixed target dates/market/persona/offer, then overwrites the campaign's copy fields -- never touches target_dates/market/persona/budget (those are what got it drafted in the first place, only the copy is being redone). Re-validates villa-api data is still available (never regenerates copy against stale/fabricated occupancy context). */
export async function regenerateOccupancyCampaignCopyAction(campaignId: string, preferredPersona?: OccupancyPersona): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, campaignId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }
  if (!["draft", "review", "rejected"].includes(campaign.status)) {
    return actionError("Copy hanya bisa dibuat ulang untuk campaign berstatus draft, review, atau rejected.");
  }

  const targets = await listOccupancyTargets(supabase);
  const target = targets.find((t) => t.id === campaign.target_id) ?? targets.find((t) => t.property_name === campaign.property_name);
  const maxDailyBudgetIdr = target?.max_daily_budget_idr ?? campaign.daily_budget_idr;

  const assets = await listReadyCreativeAssets(supabase);
  const reliableLearnings = await listReliableLearnings(supabase);

  const gapSummary = { totalDays: campaign.target_dates.length, lowDays: campaign.target_dates.length, healthyDays: 0, highDays: 0, fullDays: 0, averageOccupancyPct: 0, averageGapPct: 0 };

  let brief;
  try {
    brief = await generateOccupancyAdsBrief({
      propertyName: campaign.property_name,
      gapSummary,
      lowDates: (campaign.target_dates as string[]).map((date: string) => ({ date, occupancyPct: 0, availableUnits: 0 })),
      maxDailyBudgetIdr,
      availableAssets: assets.map((a) => ({ id: a.id, filename: a.filename, tags: a.tags ?? [] })),
      reliableLearnings,
      preferredPersona,
      // Without an explicit persona pick, steer the AI away from the
      // exact same persona it already used -- this is precisely what
      // "Buat Ulang Copy" always converging on the same angle looked like.
      avoidPersona: preferredPersona ? undefined : (campaign.audience_persona as OccupancyPersona),
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "AI gagal membuat ulang copy campaign");
  }

  try {
    await insertCampaignBriefOnly(supabase, campaignId, brief, session.employee.id);
    await updateCampaignCopyFromBrief(supabase, campaignId, brief, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan copy baru");
  }

  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

/** "Change asset" on the Meta Ad Preview -- sets which real, ready-status asset is shown/launched as this campaign's primary creative (migration 0270's primary_asset_id). Refuses an asset id that isn't a real, non-archived row. */
export async function setCampaignPrimaryAssetAction(campaignId: string, assetId: string | null): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  if (assetId) {
    try {
      const asset = await getCreativeAsset(supabase, assetId);
      if (asset.deleted_at) return actionError("Aset ini sudah diarsipkan -- pilih aset lain.");
    } catch (err) {
      return actionError(err instanceof Error ? err.message : "Aset tidak ditemukan");
    }
  }

  try {
    await setCampaignPrimaryAsset(supabase, campaignId, assetId, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengubah aset utama campaign");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

/** Direct human edit of the campaign's copy on the Meta Ad Preview -- alternative to "Buat Ulang Copy" (AI regenerate) when the admin just wants to tweak wording themselves. Same status gate as regenerate: only before a human has approved the campaign, so an edit can never silently change what's already been signed off. */
export async function updateOccupancyCampaignCopyManualAction(
  campaignId: string,
  input: { headline: string; primaryText: string; description: string; cta: string },
): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, campaignId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }
  if (!["draft", "review", "rejected"].includes(campaign.status)) {
    return actionError("Copy hanya bisa diedit untuk campaign berstatus draft, review, atau rejected.");
  }
  if (!input.headline.trim()) return actionError("Headline tidak boleh kosong");
  if (!input.primaryText.trim()) return actionError("Primary text tidak boleh kosong");
  if (!input.cta.trim()) return actionError("CTA tidak boleh kosong");

  try {
    await updateCampaignCopyManual(
      supabase,
      campaignId,
      { headline: input.headline.trim(), primaryText: input.primaryText.trim(), description: input.description.trim(), cta: input.cta.trim() },
      session.employee.id,
    );
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan perubahan copy");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}

// ---------------------------------------------------------------------------
// Campaign Decision Engine (spec §36) -- lib/occupancy/decision-engine.ts.
// RECOMMENDS ONLY: this action stores a recommendation row and, when a
// human applies it, changes at most the campaign's local status (PAUSE) --
// it NEVER calls the Meta API itself (ASSISTED mode, root CLAUDE.md /
// villa CLAUDE.md's merge-authority spirit applied here: a human decides
// before anything that touches real ad spend changes).
// ---------------------------------------------------------------------------

export async function listCampaignRecommendationsAction(campaignId: string) {
  await requirePermission("occupancy_ads.view");
  const supabase = await createClient();
  return listCampaignRecommendations(supabase, campaignId);
}

export async function requestCampaignDecisionAction(campaignId: string): Promise<ActionResult<{ decision: string; reasoning: string[] }>> {
  await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  let campaign: Awaited<ReturnType<typeof getOccupancyCampaign>>;
  try {
    campaign = await getOccupancyCampaign(supabase, campaignId);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Campaign tidak ditemukan");
  }
  if (!campaign.meta_ad_id) {
    return actionError("Campaign ini belum pernah diluncurkan ke Meta -- belum ada performa untuk dianalisis.");
  }

  // Re-classify TODAY's real occupancy for the campaign's still-upcoming target dates -- never reuse the classification from when the campaign was first drafted.
  const targets = await listOccupancyTargets(supabase);
  const target = targets.find((t) => t.id === campaign.target_id) ?? targets.find((t) => t.property_name === campaign.property_name);
  if (!target) return actionError("Target okupansi untuk campaign ini tidak ditemukan/sudah dihapus.");

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingDates = (campaign.target_dates as string[]).filter((d: string) => d >= todayIso).sort();
  if (upcomingDates.length === 0) {
    return actionError("Semua tanggal target campaign ini sudah lewat -- tidak ada okupansi masa depan untuk dianalisis.");
  }
  const rangeEnd = new Date(new Date(upcomingDates[upcomingDates.length - 1]).getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const provider = getOccupancyProvider();
  const calendarResult = await provider.getForwardAvailability(upcomingDates[0], rangeEnd);
  if (!calendarResult.ok) {
    return actionError(`Data okupansi villa-api tidak tersedia: ${calendarResult.reason}. Rekomendasi dihentikan -- tidak akan memakai data perkiraan/palsu.`);
  }

  const thresholds: OccupancyThresholds = { targetOccupancyPct: Number(target.target_occupancy_pct), criticalOccupancyPct: Number(target.critical_occupancy_pct) };
  const relevantDays = calendarResult.data.filter((d) => upcomingDates.includes(d.date)).map((d) => classifyOccupancyDay(d, thresholds));
  if (relevantDays.length === 0) {
    return actionError("villa-api tidak mengembalikan data okupansi untuk tanggal target campaign ini.");
  }

  const classificationRank: Record<string, number> = { LOW: 0, HEALTHY: 1, HIGH: 2, FULL: 3 };
  const worstDay = relevantDays.reduce((worst, d) => (classificationRank[d.classification] > classificationRank[worst.classification] ? d : worst));
  const minAvailableUnits = Math.min(...relevantDays.map((d) => d.availableUnits));

  let insights;
  try {
    insights = await getAdInsights(campaign.meta_ad_id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal mengambil data performa iklan dari Meta");
  }
  const metaInsights: DecisionEngineMetaInsights = { spendIdr: insights.spendIdr, clicks: insights.clicks, ctrPercent: insights.ctrPercent };

  const previousSnapshot = await getPreviousCampaignRecommendationSnapshot(supabase, campaignId);
  const previousInsights: DecisionEngineMetaInsights | null =
    previousSnapshot && typeof previousSnapshot.spendIdr === "number" && typeof previousSnapshot.clicks === "number" && typeof previousSnapshot.ctrPercent === "number"
      ? { spendIdr: previousSnapshot.spendIdr, clicks: previousSnapshot.clicks, ctrPercent: previousSnapshot.ctrPercent }
      : null;

  const result = decideCampaignAction({
    currentClassification: worstDay.classification,
    minAvailableUnits,
    insights: metaInsights,
    previousInsights,
  });

  try {
    await insertCampaignRecommendation(supabase, campaignId, result.decision.toLowerCase() as "scale" | "maintain" | "reduce" | "pause", result.reasoning.join(" "), {
      ...metaInsights,
      cpcIdr: result.cpcIdr,
      currentClassification: worstDay.classification,
      minAvailableUnits,
    });
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menyimpan rekomendasi");
  }

  revalidatePath("/occupancy-ads");
  return actionSuccess({ decision: result.decision, reasoning: result.reasoning });
}

/** Applies a stored recommendation -- the ONLY effect on a real campaign is a local status change to 'paused' for a PAUSE decision (mirrors pauseOccupancyCampaignAction, which itself never calls Meta). SCALE/REDUCE/MAINTAIN have no automated effect: a human adjusts budget on Meta Business Manager directly, matching this module's ASSISTED-only automation mode -- this module never pushes a budget change to Meta on its own. */
export async function applyCampaignRecommendationAction(recommendationId: string, campaignId: string, decision: "scale" | "maintain" | "reduce" | "pause"): Promise<ActionResult> {
  const session = await requirePermission("occupancy_ads.manage");
  const supabase = await createClient();

  try {
    if (decision === "pause") {
      await updateCampaignStatus(supabase, campaignId, "paused", session.employee.id);
    }
    await markRecommendationApplied(supabase, recommendationId, session.employee.id);
  } catch (err) {
    return actionError(err instanceof Error ? err.message : "Gagal menerapkan rekomendasi");
  }
  revalidatePath("/occupancy-ads");
  return actionSuccess();
}
