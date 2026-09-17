"use server";

import { revalidatePath } from "next/cache";

import { askOccupancyCopilot, generateOccupancyAdsBrief, resolveLaunchBudgetIdr } from "@/lib/ai/domains/occupancy-ads";
import { isAllowedOccupancyDestinationUrl } from "@/lib/occupancy/campaign-rules";
import { classifyOccupancyCalendar, selectAdvertisableDates, summarizeGap, type OccupancyThresholds } from "@/lib/occupancy/gap-engine";
import { getOccupancyProvider } from "@/lib/occupancy/villa-provider";
import { isMetaConfigured } from "@/lib/meta/config";
import { MetaApiError } from "@/lib/meta/client";
import { getLeaseholdTargetGeoLocations, launchLinkClickCampaign, resolveGeoLocationsFromNames } from "@/lib/meta/ads";
import { requirePermission } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import {
  getOccupancyCampaign,
  insertCampaignLearning,
  insertCreativeAsset,
  insertDraftCampaignFromBrief,
  listCreativeAssets,
  listOccupancyCampaigns,
  listOccupancyTargets,
  listReadyCreativeAssets,
  listReliableLearnings,
  markCampaignFailed,
  markCampaignLaunched,
  softDeleteCreativeAsset,
  softDeleteDraftCampaign,
  updateCampaignStatus,
  updateCreativeAssetStatus,
  updateCreativeAssetTags,
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
  if (input.maxDailyBudgetIdr < 0) return actionError("Plafon budget tidak boleh negatif");

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
