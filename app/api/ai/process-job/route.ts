import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_CONFIG } from "@/lib/ai/config";
import { draftSp1Warning, generateSalesCoaching } from "@/lib/ai/domains/crm";
import { auditWeeklyContentPerformance, researchAndDraftAd, researchAndGenerateChecklist, type ContentPlannerContext } from "@/lib/ai/domains/markom";
import { routeAndAnswer } from "@/lib/ai/domains/router";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { AIProviderError } from "@/lib/ai/provider/errors";
import { computeBackoffMs } from "@/lib/ai/provider/gemini-retry";
import type { WhatsAppAiReplyJobPayload } from "@/lib/ai/queue/ai-job-queue";
import { AI_BUSY_FALLBACK_MESSAGE, saveAiConversationTurn } from "@/lib/ai/webhook-handler";
import { isMetaConfigured } from "@/lib/meta/config";
import { getRecentInstagramMediaPerformance, isInstagramConfigured } from "@/lib/social/instagram";
import {
  LEASEHOLD_TARGET_CITIES,
  getLeaseholdTargetGeoLocations,
  getRemainingDailyBudgetIdr,
  launchWhatsAppLeadCampaign,
  resolveGeoLocationsFromNames,
} from "@/lib/meta/ads";
import type { Json } from "@/types/database.types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CrmSp1DraftJobPayload {
  sp1_warning_id: string;
}

interface CrmSalesCoachingJobPayload {
  sales_id: string;
  /** Test-only escape hatch: analyze sales_id's real data but deliver the notification here instead -- lets a Super Admin see a real coaching message without paging an actual sales rep. Omitted in normal cron-driven runs. */
  notify_user_id?: string;
}

interface MarkomChecklistDraftJobPayload {
  branch_id: string;
  branch_name: string;
  division_id: string;
}

interface MetaAdsLaunchJobPayload {
  project_id: string;
  branch_id: string;
}

/** Distinguishes "no point retrying" (not configured, no photos, budget exhausted) from transient failures -- dead-letters on the first attempt instead of burning through max_attempts backoff for something a retry can never fix. */
class NonRetryableJobError extends Error {
  readonly retryable = false as const;
}

type AdminClient = ReturnType<typeof createAdminClient>;
type JobRow = { id: string; job_type: string; payload: unknown; attempt_count: number; max_attempts: number };

/** One Gemini attempt for a queued inbound WhatsApp question, replying and logging the conversation turn. */
async function processWhatsAppAiReply(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as WhatsAppAiReplyJobPayload;
  const replyText = await routeAndAnswer(
    payload.contentText,
    payload.employeeId !== null && payload.employeeName !== null ? { id: payload.employeeId, name: payload.employeeName } : null,
    { maxAttempts: 1, jobId: job.id },
  );

  const sendResult = await sendWhatsAppText(payload.sender, replyText);
  await saveAiConversationTurn(payload.sender, payload.contentText, replyText, payload.employeeId);
  return { replySent: sendResult.success };
}

/** One Gemini attempt to draft an SP1 letter, then hands it to a human (crm_review_sp1_warning) -- never auto-issued. */
async function processCrmSp1Draft(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as CrmSp1DraftJobPayload;

  const { data: warning, error: warningError } = await supabase
    .from("crm_sp1_warnings")
    .select("id, sales_id, branch_id, period_month, period_year, reason, stuck_prospect_ids, upload_days_30d, follow_up_count_30d, closings_30d")
    .eq("id", payload.sp1_warning_id)
    .single();
  if (warningError || !warning) throw new Error(`SP1 warning ${payload.sp1_warning_id} not found: ${warningError?.message}`);

  const [{ data: sales }, { data: branch }, { data: prospects }] = await Promise.all([
    supabase.from("employees").select("full_name").eq("id", warning.sales_id).single(),
    supabase.from("branches").select("name").eq("id", warning.branch_id).single(),
    supabase.from("prospects").select("customer_name, last_follow_up_at, created_at").in("id", warning.stuck_prospect_ids),
  ]);

  const draft = await draftSp1Warning({
    salesName: sales?.full_name ?? "Sales",
    branchName: branch?.name ?? "-",
    periodLabel: `${warning.period_month}/${warning.period_year}`,
    kpi: {
      uploadDays30d: warning.upload_days_30d ?? 0,
      followUpCount30d: warning.follow_up_count_30d ?? 0,
      closings30d: warning.closings_30d ?? 0,
    },
    stuckProspects: (prospects ?? []).map((p) => ({
      customerName: p.customer_name,
      lastFollowUpLabel: new Date(p.last_follow_up_at ?? p.created_at).toLocaleDateString("id-ID"),
    })),
  });

  await supabase
    .from("crm_sp1_warnings")
    .update({ ai_draft_content: draft, status: "pending_review", updated_at: new Date().toISOString() })
    .eq("id", warning.id);

  const { data: managers } = await supabase
    .from("v_employee_directory")
    .select("id")
    .eq("branch_id", warning.branch_id)
    .eq("role_key", "kepala_cabang")
    .is("deleted_at", null);

  for (const manager of managers ?? []) {
    await supabase.from("mkc_notifications").insert({
      user_id: manager.id,
      type: "crm",
      category: "sp1_pending_review",
      title: "Draft SP1 menunggu review",
      body: `AI telah membuat draft SP1 untuk ${sales?.full_name ?? "seorang sales"}. Silakan review dan setujui/tolak.`,
      link: "/crm/warnings",
    });
  }

  return { warningId: warning.id };
}

/** One Gemini attempt to coach a sales rep with 0 closings in the last 30 days -- a supportive weekly nudge (see 0101), not a warning. Sent directly to the sales rep only, unlike stuck_prospect_alert/SP1 which also reach their manager. */
async function processCrmSalesCoaching(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as CrmSalesCoachingJobPayload;

  const [{ data: sales }, { data: activeProspects }, { data: followUps }] = await Promise.all([
    supabase.from("v_employee_directory").select("full_name, branch_name").eq("id", payload.sales_id).single(),
    supabase
      .from("prospects")
      .select("id, last_follow_up_at, created_at")
      .eq("sales_id", payload.sales_id)
      .is("deleted_at", null)
      .not("status", "in", "(closing,inactive)"),
    supabase
      .from("prospect_follow_ups")
      .select("id, prospect_id, prospects!inner(sales_id)")
      .eq("prospects.sales_id", payload.sales_id)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);
  if (!sales) throw new Error(`Sales ${payload.sales_id} not found`);

  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const stuckCount = (activeProspects ?? []).filter((p) => new Date(p.last_follow_up_at ?? p.created_at).getTime() < cutoff).length;

  const now = new Date();
  const advisory = await generateSalesCoaching({
    salesName: sales.full_name,
    branchName: sales.branch_name ?? "-",
    periodLabel: `${now.getMonth() + 1}/${now.getFullYear()}`,
    stuckProspectCount: stuckCount,
    activeProspectCount: (activeProspects ?? []).length,
    followUpCount30d: (followUps ?? []).length,
  });

  const isTestForward = Boolean(payload.notify_user_id && payload.notify_user_id !== payload.sales_id);
  const { error: insertError } = await supabase.from("mkc_notifications").insert({
    user_id: payload.notify_user_id ?? payload.sales_id,
    type: "crm",
    category: "sales_coaching_tip",
    title: isTestForward ? `[TEST] Tips AI untuk ${sales.full_name}` : "Tips dari AI untuk Anda",
    body: isTestForward ? `🧪 Pesan test -- normalnya terkirim ke ${sales.full_name} (${sales.branch_name ?? "-"}), bukan ke Anda.\n\n${advisory}` : advisory,
    link: "/crm",
  });
  if (insertError) throw new Error(`Failed to insert sales coaching notification: ${insertError.message}`);

  return { salesId: payload.sales_id };
}

/** Clamped 1-5 week-of-month, matching kpi_tasks.period_week's own convention (see AssignChecklistForm). */
function currentPeriodWeek(date: Date): number {
  return Math.min(5, Math.ceil(date.getDate() / 7));
}

/** Latest own-account snapshot (if any capture has run yet) + recent human-logged competitor observations + all registered competitor handles (so AI searches their public activity itself even with zero manual logs yet) -- real data fed into the checklist prompt instead of relying on generic web search alone. Missing platforms (not configured, or no capture has run yet) are simply omitted, not an error. */
async function gatherContentPlannerContext(supabase: AdminClient): Promise<ContentPlannerContext> {
  const [{ data: igSnapshot }, { data: ttSnapshot }, { data: competitorLogs }, { data: competitorAccounts }] = await Promise.all([
    supabase.from("social_account_snapshots").select("*").eq("platform", "instagram").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("social_account_snapshots").select("*").eq("platform", "tiktok").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id(handle, platform)")
      .order("logged_at", { ascending: false })
      .limit(10),
    supabase.from("social_competitor_accounts").select("platform, handle").eq("is_active", true),
  ]);

  const competitorNotes = (competitorLogs ?? []).map((log) => {
    const competitor = log.competitor as { handle?: string; platform?: string } | null;
    const parts = [`@${competitor?.handle ?? "?"} (${competitor?.platform ?? "?"}, ${log.content_type ?? "konten"})`];
    if (log.hook) parts.push(`hook: "${log.hook}"`);
    if (log.hashtags) parts.push(`hashtag: ${log.hashtags}`);
    if (log.engagement_notes) parts.push(`engagement: ${log.engagement_notes}`);
    return `- ${parts.join(", ")}`;
  });

  return {
    instagram: igSnapshot
      ? {
          reach: igSnapshot.reach ?? 0,
          profileViews: igSnapshot.impressions ?? 0,
          followersCount: igSnapshot.followers_count ?? 0,
          bestHour: igSnapshot.best_upload_hour,
          topContentType: igSnapshot.top_content_type,
        }
      : null,
    tiktok: ttSnapshot ? { videoViews: ttSnapshot.impressions ?? 0, likes: ttSnapshot.likes ?? 0, followersCount: ttSnapshot.followers_count ?? 0 } : null,
    competitorNotes,
    competitorHandles: (competitorAccounts ?? []).map((c) => ({ platform: c.platform, handle: c.handle })),
  };
}

/** One Gemini attempt to research + draft exactly 3 Markom checklist items, then inserts them directly (no human approval gate -- matches kpi_assign_tasks' existing behavior when a Branch Manager creates a checklist by hand) and notifies the team, same category/notification shape kpi_assign_tasks already uses. */
async function processMarkomChecklistDraft(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as MarkomChecklistDraftJobPayload;
  const context = await gatherContentPlannerContext(supabase);
  const items = await researchAndGenerateChecklist(payload.branch_name, context);

  const now = new Date();
  const dueDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const taskRows = items.map((item) => ({
    division_id: payload.division_id,
    branch_id: payload.branch_id,
    title: item.title,
    description: `${item.description}\n\n(Dibuat otomatis oleh AI berdasarkan riset tren viral & iklan kompetitor.)`,
    period_year: now.getFullYear(),
    period_month: now.getMonth() + 1,
    period_week: currentPeriodWeek(now),
    due_date: dueDate.toISOString().slice(0, 10),
  }));

  const { error: insertError } = await supabase.from("kpi_tasks").insert(taskRows);
  if (insertError) throw new Error(`Failed to insert AI checklist: ${insertError.message}`);

  const { data: team } = await supabase
    .from("v_employee_directory")
    .select("id")
    .eq("branch_id", payload.branch_id)
    .eq("division_id", payload.division_id)
    .is("deleted_at", null);

  for (const member of team ?? []) {
    await supabase.from("mkc_notifications").insert({
      user_id: member.id,
      type: "kpi_task",
      category: "markom_new_task",
      title: "Checklist Markom baru dari AI",
      body: `AI membuat ${taskRows.length} task baru berdasarkan riset tren & kompetitor. Selesaikan sebelum ${dueDate.toLocaleDateString("id-ID")}.`,
      link: "/markom",
    });
  }

  return { branchId: payload.branch_id, taskCount: taskRows.length };
}

/** Shared by processMetaAdsLaunch and processMetaAdsResearch -- both need the same project + photo lookup, with the same "no photos yet" guard. */
async function loadProjectWithPhotos(supabase: AdminClient, projectId: string) {
  const { data: project, error: projectError } = await supabase
    .from("crm_projects")
    .select("id, name, city, project_type, branch_id, product_description")
    .eq("id", projectId)
    .single();
  if (projectError || !project) throw new NonRetryableJobError(`Project ${projectId} not found: ${projectError?.message}`);

  const { data: photos } = await supabase
    .from("crm_project_photos")
    .select("id, public_url, caption")
    .eq("project_id", project.id)
    .is("deleted_at", null);
  if (!photos || photos.length === 0) {
    throw new NonRetryableJobError(`No photos uploaded for project "${project.name}" -- Markom must upload real photos before AI can launch an ad`);
  }

  return { project, photos };
}

/**
 * One attempt to research + launch a real Click-to-WhatsApp ad campaign for
 * one project -- fully autonomous per the user's explicit authorization (no
 * human pre-approval step, unlike SP1 which stays draft-only). Used only by
 * the weekly cron (markom_run_ai_ads_dispatch, migration 0081); the manual
 * "Riset" button on /markom/ads goes through processMetaAdsResearch instead,
 * which stops at a reviewable 'draft' row. The only gate here is the hard
 * budget cap (getRemainingDailyBudgetIdr, see lib/meta/ads.ts): fails closed
 * with no cap set. Every object is created ACTIVE in sequence (campaign ->
 * ad set -> creative -> ad) -- if any step fails, no Ad object exists yet,
 * so nothing spends; the campaign/ad set left behind (if any) sits idle
 * with no running ad attached to it.
 */
async function processMetaAdsLaunch(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as MetaAdsLaunchJobPayload;

  if (!isMetaConfigured()) {
    throw new NonRetryableJobError("Meta integration is not configured (META_ACCESS_TOKEN/META_AD_ACCOUNT_ID/META_PAGE_ID)");
  }

  const { project, photos } = await loadProjectWithPhotos(supabase, payload.project_id);

  let remainingBudgetIdr: number;
  try {
    remainingBudgetIdr = await getRemainingDailyBudgetIdr();
  } catch (err) {
    throw new NonRetryableJobError(err instanceof Error ? err.message : "Budget cap check failed");
  }

  const draft = await researchAndDraftAd({
    projectName: project.name,
    projectCity: project.city,
    projectType: project.project_type,
    productDescription: project.product_description,
    availablePhotos: photos.map((p) => ({ id: p.id, caption: p.caption })),
    targetCities: project.project_type === "villa" ? LEASEHOLD_TARGET_CITIES : undefined,
  });
  const photo = photos.find((p) => p.id === draft.photoId);
  if (!photo) throw new Error(`AI picked photo ${draft.photoId} which is not in the available set`);

  const dailyBudgetIdr = Math.min(Math.max(draft.suggestedDailyBudgetIdr || 30_000, 20_000), remainingBudgetIdr);
  const targeting =
    project.project_type === "villa" ? await getLeaseholdTargetGeoLocations() : await resolveGeoLocationsFromNames(draft.targetAreas, 25);

  try {
    const result = await launchWhatsAppLeadCampaign({
      projectName: project.name,
      photoUrl: photo.public_url,
      headline: draft.headline,
      primaryText: draft.primaryText,
      description: draft.description,
      welcomeMessage: draft.welcomeMessage,
      dailyBudgetIdr,
      targeting,
    });

    await supabase.from("meta_ad_campaigns").insert({
      project_id: project.id,
      branch_id: project.branch_id,
      photo_id: photo.id,
      meta_campaign_id: result.campaignId,
      meta_adset_id: result.adSetId,
      meta_creative_id: result.creativeId,
      meta_ad_id: result.adId,
      name: `${project.name} - Leads WA (AI)`,
      headline: draft.headline,
      primary_text: draft.primaryText,
      description: draft.description,
      welcome_message: draft.welcomeMessage,
      daily_budget_idr: dailyBudgetIdr,
      status: "active",
      launched_by: "ai",
      research_summary: draft.targetSummary,
      target_areas: draft.targetAreas,
    });

    const { data: managers } = await supabase
      .from("v_employee_directory")
      .select("id")
      .eq("branch_id", project.branch_id)
      .eq("role_key", "kepala_cabang")
      .is("deleted_at", null);
    for (const manager of managers ?? []) {
      await supabase.from("mkc_notifications").insert({
        user_id: manager.id,
        type: "crm",
        category: "ad_campaign_launched",
        title: "AI meluncurkan iklan baru",
        body: `AI meluncurkan iklan Click-to-WhatsApp untuk project "${project.name}" dengan budget harian Rp ${dailyBudgetIdr.toLocaleString("id-ID")}.`,
        link: "/markom/ads",
      });
    }

    return { projectId: project.id, metaAdId: result.adId, dailyBudgetIdr };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await supabase.from("meta_ad_campaigns").insert({
      project_id: project.id,
      branch_id: project.branch_id,
      photo_id: photo.id,
      meta_campaign_id: null,
      meta_adset_id: null,
      meta_creative_id: null,
      meta_ad_id: null,
      name: `${project.name} - Leads WA (AI, gagal)`,
      headline: draft.headline,
      primary_text: draft.primaryText,
      description: draft.description,
      welcome_message: draft.welcomeMessage,
      daily_budget_idr: dailyBudgetIdr,
      status: "failed",
      launched_by: "ai",
      research_summary: draft.targetSummary,
      target_areas: draft.targetAreas,
      failure_reason: errorMessage,
    });
    throw new NonRetryableJobError(`Meta API call failed while launching ad for "${project.name}": ${errorMessage}`);
  }
}

interface MetaAdsResearchJobPayload {
  project_id: string;
  branch_id: string;
}

/**
 * One attempt to research (Google Search grounding, no Meta API calls, no
 * spend) and save a reviewable 'draft' row -- triggered by the manual
 * "Riset" button (markom_request_ads_research RPC, migration 0082). A human
 * then reviews the draft on /markom/ads and clicks "Luncurkan" separately
 * (launchDraftCampaignAction, features/markom/actions/ads.actions.ts) to
 * actually spend, using launchWhatsAppLeadCampaign directly -- no second
 * Gemini call needed at that point.
 */
/** Unlike processMetaAdsLaunch (a background cron nobody is watching in real time), a human just clicked "Riset" and is looking at /markom/ads waiting for something to appear -- a silent dead-letter with no visible row is a real UX gap, so every failure path here also writes a 'failed' card instead of vanishing. */
async function processMetaAdsResearch(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as MetaAdsResearchJobPayload;

  try {
    const { project, photos } = await loadProjectWithPhotos(supabase, payload.project_id);

    const draft = await researchAndDraftAd({
      projectName: project.name,
      projectCity: project.city,
      projectType: project.project_type,
      productDescription: project.product_description,
      availablePhotos: photos.map((p) => ({ id: p.id, caption: p.caption })),
      targetCities: project.project_type === "villa" ? LEASEHOLD_TARGET_CITIES : undefined,
    });
    const photo = photos.find((p) => p.id === draft.photoId);
    if (!photo) throw new Error(`AI picked photo ${draft.photoId} which is not in the available set`);

    const { data: inserted, error: insertError } = await supabase
      .from("meta_ad_campaigns")
      .insert({
        project_id: project.id,
        branch_id: project.branch_id,
        photo_id: photo.id,
        name: `${project.name} - Leads WA (Draft)`,
        headline: draft.headline,
        primary_text: draft.primaryText,
        description: draft.description,
        welcome_message: draft.welcomeMessage,
        daily_budget_idr: Math.max(draft.suggestedDailyBudgetIdr || 30_000, 20_000),
        status: "draft",
        launched_by: "human",
        research_summary: draft.targetSummary,
        target_areas: draft.targetAreas,
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error(`Failed to save ad draft: ${insertError?.message}`);

    return { projectId: project.id, draftId: inserted.id };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const { data: project } = await supabase.from("crm_projects").select("name").eq("id", payload.project_id).maybeSingle();
    await supabase.from("meta_ad_campaigns").insert({
      project_id: payload.project_id,
      branch_id: payload.branch_id,
      photo_id: null,
      name: `${project?.name ?? "Project"} - Riset gagal`,
      headline: "Riset gagal",
      primary_text: errorMessage,
      daily_budget_idr: 0,
      status: "failed",
      launched_by: "human",
      failure_reason: errorMessage,
    });
    throw new NonRetryableJobError(errorMessage);
  }
}

/** Monday of the ISO week containing `date`, as YYYY-MM-DD. */
function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

/**
 * Weekly AI evaluation of content performance -- compares this week's
 * own-account numbers (Instagram/TikTok) to last week's, plus this week's
 * human-logged competitor observations, into a written verdict + next-week
 * recommendation. Upserted per week_start (unique, migration 0085) so a
 * retry or re-run for the same week overwrites rather than duplicating.
 */
async function processSocialWeeklyEvaluation(supabase: AdminClient) {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const lastWeekStartDate = new Date(weekStart);
  lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  const lastWeekStart = lastWeekStartDate.toISOString().slice(0, 10);

  const [{ data: igThisWeek }, { data: igLastWeek }, { data: ttThisWeek }, { data: competitorLogs }] = await Promise.all([
    supabase.from("social_account_snapshots").select("*").eq("platform", "instagram").gte("captured_at", weekStart).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_account_snapshots")
      .select("*")
      .eq("platform", "instagram")
      .gte("captured_at", lastWeekStart)
      .lt("captured_at", weekStart)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("social_account_snapshots").select("*").eq("platform", "tiktok").gte("captured_at", weekStart).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id(handle, platform)")
      .gte("logged_at", weekStart)
      .order("logged_at", { ascending: false })
      .limit(15),
  ]);

  const competitorNotes = (competitorLogs ?? []).map((log) => {
    const competitor = log.competitor as { handle?: string; platform?: string } | null;
    const parts = [`@${competitor?.handle ?? "?"} (${competitor?.platform ?? "?"}, ${log.content_type ?? "konten"})`];
    if (log.hook) parts.push(`hook: "${log.hook}"`);
    if (log.hashtags) parts.push(`hashtag: ${log.hashtags}`);
    if (log.engagement_notes) parts.push(`engagement: ${log.engagement_notes}`);
    return `- ${parts.join(", ")}`;
  });

  // Live per-post data (captions + real per-post engagement) -- the daily
  // snapshot only stores account-level aggregates, so a genuine
  // hook/value/CTA audit needs a fresh read of actual recent posts. Best
  // effort: a transient Instagram API failure here must not fail the whole
  // weekly audit, just narrow it to account-level-only (same fallback
  // auditWeeklyContentPerformance already handles for an empty post list).
  let instagramTopPosts: Awaited<ReturnType<typeof getRecentInstagramMediaPerformance>> = [];
  if (isInstagramConfigured()) {
    try {
      const recentPosts = await getRecentInstagramMediaPerformance(12);
      instagramTopPosts = recentPosts.filter((p) => p.timestamp >= weekStart);
    } catch (err) {
      logger.error("processSocialWeeklyEvaluation: failed to fetch recent Instagram posts, auditing account-level only", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  // impressions doubles as "profile views" for Instagram snapshots -- see the capture route's mapping comment.
  const audit = await auditWeeklyContentPerformance({
    instagramThisWeek: igThisWeek ? { reach: igThisWeek.reach ?? 0, profileViews: igThisWeek.impressions ?? 0, followersCount: igThisWeek.followers_count ?? 0 } : null,
    instagramLastWeek: igLastWeek ? { reach: igLastWeek.reach ?? 0, profileViews: igLastWeek.impressions ?? 0, followersCount: igLastWeek.followers_count ?? 0 } : null,
    instagramTopPosts,
    tiktokThisWeek: ttThisWeek ? { videoViews: ttThisWeek.impressions ?? 0, likes: ttThisWeek.likes ?? 0, followersCount: ttThisWeek.followers_count ?? 0 } : null,
    competitorNotes,
  });

  const { error: upsertError } = await supabase
    .from("social_weekly_evaluations")
    .upsert({ week_start: weekStart, evaluation: audit.narrative, audit: audit as unknown as Json }, { onConflict: "week_start" });
  if (upsertError) throw new Error(`Failed to save weekly evaluation: ${upsertError.message}`);

  return { weekStart };
}

/**
 * Dispatched by ai_job_queue_after_insert (immediate, on enqueue) and
 * ai_job_dispatch_pending (pg_cron sweep every 1 minute, migration 0065).
 *
 * Does exactly ONE Gemini attempt per invocation — the backoff between
 * attempts is expressed as next_attempt_at (a future dispatch, picked up by
 * the next cron sweep), never an in-process sleep. That's the actual fix for
 * the risk flagged earlier in this project: a 20s/40s/80s in-process backoff
 * sequence can exceed a Vercel serverless function's duration limit and
 * silently drop the result even with otherwise-correct retry code. This
 * route can never block long enough to hit that limit, no matter how many
 * attempts a job eventually needs — each invocation does one attempt and
 * returns.
 */
export async function POST(request: Request) {
  let jobId: string | undefined;
  try {
    const body = await request.json();
    jobId = body?.job_id;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!jobId) {
    return NextResponse.json({ error: "job_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Atomic claim: the insert trigger and the cron sweep can both dispatch
  // the same job (the sweep is a safety net, not exclusive with the
  // trigger) -- a conditional UPDATE ... WHERE status = 'pending' means
  // only one concurrent invocation ever actually claims it; the other gets
  // zero rows back and no-ops instead of double-processing.
  const { data: job, error: claimError } = await supabase
    .from("ai_job_queue")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (claimError) {
    logger.error("ai job claim failed", { jobId, error: claimError.message });
    return NextResponse.json({ status: "error", reason: "claim failed" }, { status: 200 });
  }
  if (!job) {
    return NextResponse.json({ status: "skipped", reason: "already claimed or not pending" }, { status: 200 });
  }

  const isWhatsAppReply = job.job_type === "whatsapp_ai_reply";

  try {
    const result =
      job.job_type === "whatsapp_ai_reply"
        ? await processWhatsAppAiReply(supabase, job)
        : job.job_type === "crm_sp1_draft"
          ? await processCrmSp1Draft(supabase, job)
          : job.job_type === "crm_sales_coaching"
            ? await processCrmSalesCoaching(supabase, job)
            : job.job_type === "markom_checklist_draft"
            ? await processMarkomChecklistDraft(supabase, job)
            : job.job_type === "meta_ads_launch"
              ? await processMetaAdsLaunch(supabase, job)
              : job.job_type === "meta_ads_research"
                ? await processMetaAdsResearch(supabase, job)
                : await processSocialWeeklyEvaluation(supabase);
    await supabase.from("ai_job_queue").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", job.id);

    logger.info("ai job succeeded", { jobId: job.id, jobType: job.job_type, attempt: job.attempt_count + 1, result });
    return NextResponse.json({ status: "succeeded", result });
  } catch (err) {
    const attemptCount = job.attempt_count + 1;
    const retryable = err instanceof AIProviderError ? err.retryable : err instanceof NonRetryableJobError ? false : true;
    const errorMessage = err instanceof Error ? err.message : String(err);

    if (retryable && attemptCount < job.max_attempts) {
      const waitMs = computeBackoffMs(AI_CONFIG.retryBaseDelayMs, attemptCount);
      await supabase
        .from("ai_job_queue")
        .update({
          status: "pending",
          attempt_count: attemptCount,
          last_error: errorMessage,
          next_attempt_at: new Date(Date.now() + waitMs).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);

      logger.info("ai job rescheduled", { jobId: job.id, jobType: job.job_type, attemptCount, maxAttempts: job.max_attempts, waitMs, error: errorMessage });
      return NextResponse.json({ status: "rescheduled", attemptCount, waitMs });
    }

    // Every attempt is used up, or the failure is non-retryable (e.g. model
    // not found, Meta not configured, no budget headroom). whatsapp_ai_reply
    // must never leave the user without a reply -- send the friendly
    // fallback now instead of silently dead-lettering with no WhatsApp
    // message ever arriving. crm_sp1_draft, markom_checklist_draft, and
    // meta_ads_launch have no chat counterpart waiting on a reply, so they
    // just dead-letter: crm_sp1_draft's warning row already exists (unique
    // sales_id/period_month/period_year), so nothing re-enqueues it
    // automatically; markom_checklist_draft simply skips that team's
    // checklist for this cycle; meta_ads_launch's 7-day cooldown
    // (markom_run_ai_ads_dispatch, migration 0081) means that project just
    // gets retried on the next weekly dispatch. An operator can re-trigger
    // any of them manually if needed.
    logger.error("ai job exhausted", { jobId: job.id, jobType: job.job_type, attemptCount, retryable, error: errorMessage });

    if (isWhatsAppReply) {
      const payload = job.payload as unknown as WhatsAppAiReplyJobPayload;
      const sendResult = await sendWhatsAppText(payload.sender, AI_BUSY_FALLBACK_MESSAGE);
      await saveAiConversationTurn(payload.sender, payload.contentText, AI_BUSY_FALLBACK_MESSAGE, payload.employeeId);

      await supabase
        .from("ai_job_queue")
        .update({ status: "dead_letter", attempt_count: attemptCount, last_error: errorMessage, updated_at: new Date().toISOString() })
        .eq("id", job.id);

      return NextResponse.json({ status: "dead_letter", replySent: sendResult.success });
    }

    await supabase
      .from("ai_job_queue")
      .update({ status: "dead_letter", attempt_count: attemptCount, last_error: errorMessage, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    return NextResponse.json({ status: "dead_letter" });
  }
}
