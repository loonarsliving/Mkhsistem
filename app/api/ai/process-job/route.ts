import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_CONFIG } from "@/lib/ai/config";
import { draftSp1Warning, generateSalesCoaching } from "@/lib/ai/domains/crm";
import {
  auditWeeklyBeautyContentPerformance,
  compareBeautyCompetitorContent,
  discoverBeautyCompetitors,
  evaluateLoonarsWeeklyPerformance,
  generateBeautyHashtagBank,
  researchAndGenerateBeautyContentIdeas,
} from "@/lib/ai/domains/loonars-beauty";
import { processKnowledgeBankRefreshJob } from "@/lib/ai/domains/knowledge-bank";
import { processInvestorIntelligenceRefreshJob } from "@/lib/ai/domains/investor-intelligence";
import { processCashflowIntelligenceRefreshJob } from "@/lib/ai/domains/cashflow-intelligence";
import { processOccupancyIntelligenceRefreshJob } from "@/lib/ai/domains/occupancy-intelligence";
import { processFridayExecutiveBriefing, type FridayBriefingJobPayload } from "@/lib/ai/friday/briefing";
import { processFridayHoldingBriefing, type FridayHoldingBriefingJobPayload } from "@/lib/ai/friday/holding";
import { generateWeeklySalesTeaching } from "@/lib/ai/domains/sales-teaching";
import { generateCashflowActionPlan } from "@/lib/ai/domains/cashflow-teaching";
import { generateOccupancyTeaching, type OccupancyPropertySnapshot } from "@/lib/ai/domains/occupancy-teaching";
import {
  auditWeeklyContentPerformance,
  compareLeaseholdCompetitorContent,
  discoverPropertyCompetitors,
  generateHashtagBank,
  generateMonthlyContentReportNarrative,
  researchAndDraftAd,
  researchAndGenerateChecklist,
  reviewContentSubmission,
  type ChecklistContentFocus,
  type ContentPlannerContext,
  type MonthlyContentReportComputed,
  type MonthlyReportWeekSummary,
  type WeeklyContentAuditResult,
} from "@/lib/ai/domains/markom";
import { getSystemPrompt } from "@/lib/ai/domains/prompts";
import { routeAndAnswer } from "@/lib/ai/domains/router";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { askAI } from "@/lib/ai/service";
import { AIProviderError } from "@/lib/ai/provider/errors";
import { computeBackoffMs } from "@/lib/ai/provider/gemini-retry";
import type { WhatsAppAdminAnswerRelayJobPayload, WhatsAppAiReplyJobPayload, WhatsAppLeadNurtureReplyJobPayload } from "@/lib/ai/queue/ai-job-queue";
import { handleAdDrivenNurtureLead, continueExistingLeadNurture, relayAdminAnswerToLead, resolveProjectSelectionAndNurture } from "@/lib/ai/domains/lead-nurture";
import { AI_BUSY_FALLBACK_MESSAGE, saveAiConversationTurn } from "@/lib/ai/webhook-handler";
import { isMetaConfigured } from "@/lib/meta/config";
import { countActiveCompetitors, insertDiscoveredCompetitors, replaceHashtagBank, type CompetitorFocus } from "@/repositories/social.repository";
import { insertAdCampaignPhotos } from "@/repositories/meta-ads.repository";
import { createContentSubmission, deleteSubmissionMediaFromStorage, reconcileZernioPublishStatus, saveContentReview, scheduleContentSubmission } from "@/repositories/content-submissions.repository";
import { fetchUrlAsBase64 } from "@/lib/utils/fetch-remote-file";
import { generateCreativeBrief, type DirectorObjective, type DirectorPlatform } from "@/lib/ai/domains/kontenai-director";
import { generateStoryboardFromBrief } from "@/lib/ai/domains/kontenai-storyboard";
import { matchAssetsToScenes } from "@/features/kontenai/asset-selector/lib/scene-asset-matching";
import { listAnalyzedAssetLibrary, listAnalyzedAssetsForDirector } from "@/repositories/kontenai-assets.repository";
import { createKontenAiCreativeBrief } from "@/repositories/kontenai-creative-briefs.repository";
import { createKontenAiStoryboard, updateKontenAiStoryboardScenes, type KontenAiStoryboardScene } from "@/repositories/kontenai-storyboards.repository";
import { createKontenAiRenderJob } from "@/repositories/kontenai-render-jobs.repository";
import { analyzeBrandFootageForRun } from "@/lib/kontenai/brand-footage-vision";
import { BEAUTY_TARGET_AUDIENCE, beautyObjectiveForCategory, buildBeautyCampaignGoal } from "@/lib/kontenai/beauty-brief-input";
import { moveRenderOutputToContentStudio } from "@/lib/kontenai/content-studio-bridge";
import { getRecentInstagramMediaPerformance, isInstagramConfigured, summarizeBestPostingPattern, type InstagramMediaPerformance } from "@/lib/social/instagram";
import { getZernioPostStatus, isZernioConfigured, listZernioAccounts, getRecentZernioMediaPerformance, type ZernioProduct } from "@/lib/social/zernio";
import {
  LEASEHOLD_TARGET_CITIES,
  getLeaseholdTargetGeoLocations,
  getRemainingDailyBudgetIdr,
  launchWhatsAppLeadCampaign,
  resolveGeoLocationsFromNames,
} from "@/lib/meta/ads";
import type { Json } from "@/types/database.types";
import { requireCronAuth } from "@/lib/security/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Video ad launches poll Meta for up to ~90s waiting for video processing
// (uploadAdVideoFromUrl, lib/meta/ads.ts) -- default duration isn't enough headroom for that plus the rest of a launch job's steps.
export const maxDuration = 120;

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
  /** Defaults to "leasehold_sales" (investor pitch) when absent -- "occupancy" (guest/renter angle) only ever set explicitly by markom_run_ai_checklist_dispatch for branches with an active villa project. */
  focus?: "leasehold_sales" | "occupancy";
}

interface MetaAdsLaunchJobPayload {
  project_id: string;
  branch_id: string;
}

interface KnowledgeBankRefreshJobPayload {
  topic: string;
}

interface SalesClosingTipsJobPayload {
  sales_id: string;
  sales_name: string;
  sales_phone: string;
  branch_name: string;
  product_type: "villa" | "subsidized" | "commercial" | "unknown";
}

interface InvestorIntelligenceRefreshJobPayload {
  topic: string;
}

interface CashflowIntelligenceRefreshJobPayload {
  topic: string;
}

interface SalesTeachingWeeklyJobPayload {
  branch_id: string;
  branch_name: string;
}

interface CashflowActionPlanJobPayload {
  branch_id: string;
  branch_name: string;
  saldo: number;
  threshold: number;
}

interface OccupancyIntelligenceRefreshJobPayload {
  topic: string;
}

interface OccupancyTeachingBiweeklyJobPayload {
  branch_id: string;
  branch_name: string;
}

interface ContentSubmissionReviewJobPayload {
  submission_id: string;
}

interface KontenAiAutoProduceJobPayload {
  kpi_task_id: string;
}

interface KontenAiAutoProduceBeautyJobPayload {
  content_item_id: string;
}

interface KontenAiAutoBridgeToStudioJobPayload {
  render_job_id: string;
}

interface ZernioPublishReconcileJobPayload {
  submission_id: string;
}

/** Distinguishes "no point retrying" (not configured, no photos, budget exhausted) from transient failures -- dead-letters on the first attempt instead of burning through max_attempts backoff for something a retry can never fix. */
class NonRetryableJobError extends Error {
  readonly retryable = false as const;
}

type AdminClient = ReturnType<typeof createAdminClient>;
type JobRow = { id: string; job_type: string; payload: unknown; attempt_count: number; max_attempts: number };

/**
 * The dispatch chain below used to end in a bare `: processSocialWeeklyEvaluation(...)`,
 * which quietly made "social weekly evaluation" the handler for every job type
 * this build does not recognize.
 *
 * That is a live hazard whenever the database learns a job type before the code
 * does -- exactly what happens in the window between applying a migration and
 * shipping the deploy that handles it. The queue row inserts fine (the check
 * constraint already allows it), the insert trigger dispatches it here, the
 * unknown type falls through, and the team receives a content-performance
 * broadcast nobody asked for -- reported as `succeeded`, so nothing looks wrong.
 *
 * Dead-lettering instead is the honest outcome: the job is visibly stuck until
 * the deploy that understands it lands, and no unrelated automation fires in
 * the meantime.
 */
function unknownJobType(jobType: string): never {
  throw new NonRetryableJobError(`Unknown job_type "${jobType}" -- this deployment has no handler for it (database is ahead of the deployed code?)`);
}

/** One Gemini attempt for a queued inbound WhatsApp question, replying and logging the conversation turn. */
async function processWhatsAppAiReply(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as WhatsAppAiReplyJobPayload;
  const replyText = await routeAndAnswer(
    payload.contentText,
    payload.employeeId !== null && payload.employeeName !== null ? { id: payload.employeeId, name: payload.employeeName } : null,
    { maxAttempts: 1, jobId: job.id, senderWaNumber: payload.sender },
  );

  const sendResult = await sendWhatsAppText(payload.sender, replyText);
  await saveAiConversationTurn(payload.sender, payload.contentText, replyText, payload.employeeId);
  return { replySent: sendResult.success };
}

/** One nurture-bot turn (lib/ai/domains/lead-nurture.ts) -- either a fresh/repeat ad click (adReferralSourceId set) or a follow-up message from a number that already has an ad-driven prospects row. */
async function processLeadNurtureReply(job: JobRow) {
  const payload = job.payload as unknown as WhatsAppLeadNurtureReplyJobPayload;
  const result = payload.resolvedProjectId
    ? await resolveProjectSelectionAndNurture(payload.sender, payload.senderName ?? undefined, payload.resolvedProjectId, payload.contentText)
    : payload.adReferralSourceId
      ? await handleAdDrivenNurtureLead(payload.sender, payload.senderName ?? undefined, { sourceId: payload.adReferralSourceId, sourceType: "whatsapp" }, payload.contentText)
      : await continueExistingLeadNurture(payload.sender, payload.senderName ?? undefined, payload.contentText);
  return { outcome: result?.outcome ?? "no_prospect", temperature: result && "temperature" in result ? result.temperature : undefined };
}

/** Rephrases + sends a Super Admin's "[PQ-0001]: jawaban" answer to the lead (the DB writes already happened synchronously in the webhook -- see tryHandleSuperadminAnswer). */
async function processAdminAnswerRelay(job: JobRow) {
  const payload = job.payload as unknown as WhatsAppAdminAnswerRelayJobPayload;
  const result = await relayAdminAnswerToLead(payload.pendingQuestionId);
  return { sent: result.sent };
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

const CONTENT_REVIEW_MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * Runs Content Studio's AI review (reviewContentSubmission) for a submission
 * that has no browser session to run inside -- currently only content the
 * KontenAI Render Engine produced and registered directly via SQL (Drive-
 * hosted output, never went through createContentSubmissionAction's upload
 * form). Mirrors runReviewAndSave in
 * features/markom/actions/content-submission.actions.ts, except the video
 * fetch goes through the Drive service account (getDriveAuthHeader +
 * driveMediaUrl) instead of a plain public fetch, since a Drive file's
 * storage_path here is a Drive file id, not a Supabase Storage path.
 */
async function processContentSubmissionReview(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as ContentSubmissionReviewJobPayload;

  const { data: submission, error: submissionError } = await supabase
    .from("markom_content_submissions")
    .select("id, task_id, caption, media_type, public_url, submitted_by, content_focus, platform")
    .eq("id", payload.submission_id)
    .single();
  if (submissionError || !submission) throw new Error(`Content submission ${payload.submission_id} not found: ${submissionError?.message}`);

  let taskTitle = "Konten mandiri (tanpa checklist)";
  let taskDescription: string | null = null;
  if (submission.task_id) {
    const { data: task } = await supabase.from("kpi_tasks").select("title, description").eq("id", submission.task_id).single();
    if (task) {
      taskTitle = task.title;
      taskDescription = task.description;
    }
  }

  let imageBase64: string | undefined;
  let videoBase64: string | undefined;
  const mimeType = submission.media_type === "video" ? "video/mp4" : "image/jpeg";

  if (submission.media_type === "image") {
    imageBase64 = await fetchUrlAsBase64(submission.public_url);
  } else {
    try {
      const base64 = await fetchUrlAsBase64(submission.public_url);
      const approxBytes = Math.ceil((base64.length * 3) / 4);
      if (approxBytes <= CONTENT_REVIEW_MAX_VIDEO_BYTES) videoBase64 = base64;
    } catch {
      videoBase64 = undefined;
    }
  }

  const review = await reviewContentSubmission({
    taskTitle,
    taskDescription,
    caption: submission.caption,
    mediaType: submission.media_type as "image" | "video",
    imageBase64,
    imageMimeType: mimeType,
    videoBase64,
    videoMimeType: mimeType,
  });

  await saveContentReview(supabase, submission.id, {
    status: review.verdict,
    score: review.score,
    aiVerdict: review.feedback,
    updatedBy: submission.submitted_by,
  });

  if (review.verdict === "approved") {
    const target = new Date(Date.now() + 60 * 60 * 1000);
    await scheduleContentSubmission(supabase, submission.id, target.toISOString(), submission.submitted_by);
  }

  // Same tick-the-checklist-and-notify step the browser upload path runs
  // (createContentSubmissionAction). KontenAI-sourced content has no session
  // behind it, so this reaches markom_content_submitted as the service role --
  // see 0183 for why the function accepts that caller.
  //
  // Non-fatal on purpose: the review is already saved by this point, and
  // letting a notification failure fail the job would send it back through
  // retry/backoff and re-run a Gemini call for work that is done.
  const { error: notifyError } = await supabase.rpc("markom_content_submitted", {
    p_submission_id: submission.id,
  });
  if (notifyError) {
    logger.error("content submission review: failed to tick task / notify verifier", {
      submissionId: submission.id,
      error: notifyError.message,
    });
  }

  return { score: review.score, verdict: review.verdict };
}

const KONTENAI_PRODUCT_CONTEXT: Record<string, { productProject: string; targetAudience: string }> = {
  occupancy: { productProject: "Villa & Kos - Booking Harian (Occupancy)", targetAudience: "Wisatawan dan calon tamu yang mencari staycation/kos harian" },
  leasehold_sales: { productProject: "Properti Leasehold - Penjualan Unit", targetAudience: "Calon investor dan pembeli unit properti" },
  beauty: { productProject: "Loonars Beauty", targetAudience: "Pelanggan skincare/beauty yang aktif di media sosial" },
};

/**
 * Restricted to instagram/tiktok, never facebook -- Content Studio
 * (markom_content_submissions) only supports those two for actual publish,
 * so an automation-originated brief must never target a platform the bridge
 * step can't hand off downstream.
 */
function inferPlatformFromText(text: string): DirectorPlatform {
  return text.toLowerCase().includes("tiktok") ? "tiktok" : "instagram";
}

function extractCaptionFromDescription(description: string | null, fallback: string): string {
  if (!description) return fallback;
  const match = description.match(/Caption:\s*['"]([^'"]+)['"]/i);
  return match ? match[1].trim() : fallback;
}

function generateAutomationSceneId(): string {
  return `scene-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

/**
 * Short "what worked/didn't work recently" note for this content_focus,
 * folded into the next brief's campaignGoal -- the closest thing to a daily
 * learning loop without a live-tuned model: AI Director sees actual recent
 * Content Studio scores/feedback for the same product line every time it
 * writes a new brief, instead of writing every day's brief from a blank slate.
 */
async function buildRecentPerformanceNote(supabase: AdminClient, contentFocus: "leasehold_sales" | "occupancy" | "beauty"): Promise<string> {
  const { data: recent } = await supabase
    .from("markom_content_submissions")
    .select("ai_score, ai_verdict")
    .eq("content_focus", contentFocus)
    .not("ai_score", "is", null)
    .order("ai_reviewed_at", { ascending: false })
    .limit(5);

  if (!recent || recent.length === 0) return "";

  const avgScore = recent.reduce((sum, row) => sum + Number(row.ai_score ?? 0), 0) / recent.length;
  const feedbackLines = recent
    .slice(0, 3)
    .map((row) => `- (skor ${row.ai_score}) ${row.ai_verdict ?? ""}`.trim())
    .filter((line) => line.length > 10);

  if (feedbackLines.length === 0) return "";

  return `\n\nCatatan performa konten sebelumnya untuk lini ini (rata-rata skor AI ${avgScore.toFixed(1)}/10):\n${feedbackLines.join("\n")}\nGunakan catatan ini untuk memperbaiki brief baru -- hindari pengulangan kelemahan yang sama.`;
}

/**
 * Full "brief -> siap di-render" chain for one automation-originated
 * kpi_task: AI Director generates a Creative Brief (real Gemini call, with
 * recent Content Studio performance folded in as context), Storyboard Engine
 * turns it into scenes (another Gemini call), Asset Selector matches every
 * scene against the analyzed Asset Library (deterministic, no AI call), and
 * a render job is queued for the existing Railway worker to pick up. Mirrors
 * generateCreativeBriefAction/generateStoryboardAction/runAssetSelectionAction/
 * createRenderJobAction exactly, just without the session each of those
 * requires (this runs from a cron dispatch, not a logged-in user).
 */
async function processKontenAiAutoProduce(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as KontenAiAutoProduceJobPayload;

  const { data: existingBrief } = await supabase
    .from("kontenai_creative_briefs")
    .select("id")
    .eq("kpi_task_id", payload.kpi_task_id)
    .maybeSingle();
  if (existingBrief) return { skipped: true, reason: "brief already exists for this task" };

  const { data: task, error: taskError } = await supabase
    .from("kpi_tasks")
    .select("id, title, description, content_focus, created_by")
    .eq("id", payload.kpi_task_id)
    .single();
  if (taskError || !task) throw new Error(`kpi_task ${payload.kpi_task_id} not found: ${taskError?.message}`);
  if (!task.created_by) throw new NonRetryableJobError(`kpi_task ${task.id} has no created_by -- can't attribute automation-produced rows to an actor`);
  const createdBy = task.created_by;
  const contentFocus = task.content_focus as "leasehold_sales" | "occupancy" | "beauty";

  const context = KONTENAI_PRODUCT_CONTEXT[contentFocus] ?? KONTENAI_PRODUCT_CONTEXT.occupancy;
  const platform = inferPlatformFromText(task.description ?? task.title);
  const objective: DirectorObjective = "engagement";
  const performanceNote = await buildRecentPerformanceNote(supabase, contentFocus);
  const campaignGoal = `${task.title} -- tujuan utama: meningkatkan engagement.${performanceNote}`;

  const assets = await listAnalyzedAssetsForDirector(supabase, { productProject: context.productProject, platform, limit: 20 });
  const directorResult = await generateCreativeBrief({
    objective,
    platform,
    targetAudience: context.targetAudience,
    productProject: context.productProject,
    campaignGoal,
    assets: assets.map((asset) => ({
      title: asset.title,
      assetType: asset.assetType,
      aiDescription: asset.aiDescription,
      aiTags: asset.aiTags,
      aiCategory: asset.aiCategory,
      aiMood: asset.aiMood,
    })),
  });

  const brief = await createKontenAiCreativeBrief(supabase, {
    objective,
    platform,
    targetAudience: context.targetAudience,
    productProject: context.productProject,
    campaignGoal,
    bigIdea: directorResult.bigIdea,
    hook: directorResult.hook,
    keyMessage: directorResult.keyMessage,
    targetEmotion: directorResult.targetEmotion,
    cta: directorResult.cta,
    contentAngle: directorResult.contentAngle,
    productionDirection: directorResult.productionDirection,
    referencedAssetIds: assets.map((asset) => asset.id),
    // Without this the brief lands with content_focus null, and every
    // brand-scoped step downstream (footage analysis, the candidate pool,
    // Content Studio's focus filter) silently loses the brand it was made for.
    contentFocus,
    createdBy,
    kpiTaskId: task.id,
  });

  const sceneDrafts = await generateStoryboardFromBrief({
    platform: brief.platform,
    objective: brief.objective,
    bigIdea: brief.big_idea,
    hook: brief.hook,
    keyMessage: brief.key_message,
    targetEmotion: brief.target_emotion,
    cta: brief.cta,
    contentAngle: brief.content_angle,
  });

  const draftScenes: KontenAiStoryboardScene[] = sceneDrafts.map((draft, index) => ({
    ...draft,
    id: generateAutomationSceneId(),
    order: index,
    selectedAssetId: null,
    assetMatches: [],
  }));

  const storyboard = await createKontenAiStoryboard(supabase, {
    creativeBriefId: brief.id,
    title: `Storyboard: ${brief.product_project}`,
    scenes: draftScenes,
    createdBy,
  });

  // Vision, inside the production run, on this brand's footage -- the same
  // step runAssetSelectionAction does. The automation path needs it more than
  // the UI does: nobody is here to notice unanalyzed footage and click
  // "Analyze" first, so without it the pool below is whatever happened to be
  // analyzed by hand and the run dies on the "not enough matching assets"
  // guard while a full Drive folder sits there unread.
  const visionOutcome = await analyzeBrandFootageForRun(supabase, contentFocus);

  const assetPool = await listAnalyzedAssetLibrary(supabase, { company: contentFocus });
  const matches = matchAssetsToScenes(draftScenes, assetPool);
  const selectedScenes: KontenAiStoryboardScene[] = draftScenes.map((scene, index) => ({
    ...scene,
    selectedAssetId: matches[index].selectedAssetId,
    assetMatches: matches[index].assetMatches,
  }));

  if (!selectedScenes.every((scene) => scene.selectedAssetId)) {
    throw new NonRetryableJobError(
      `Asset Library belum punya footage ${contentFocus} yang bisa dipakai untuk brief "${task.title}" (${visionOutcome.analyzed} dianalisis, ${visionOutcome.failed} gagal dibaca pada run ini) -- tambahkan footage ke folder brand ini lalu jalankan lagi.`,
    );
  }

  const updatedStoryboard = await updateKontenAiStoryboardScenes(supabase, storyboard.id, selectedScenes, createdBy);
  const renderJob = await createKontenAiRenderJob(supabase, { storyboardId: updatedStoryboard.id, createdBy });

  return {
    creativeBriefId: brief.id,
    storyboardId: updatedStoryboard.id,
    renderJobId: renderJob.id,
    footageAnalyzed: visionOutcome.analyzed,
    footageFailed: visionOutcome.failed,
  };
}

/**
 * Which employee owns the rows an automated run creates.
 *
 * kontenai_creative_briefs/storyboards/render_jobs.created_by is NOT NULL and
 * references employees(id), but the rows the automation starts from often have
 * no author: loonars_content_items drafted by the daily cron have created_by
 * null. Falling back to Super Admin (who is the only role with KontenAI access
 * -- see features/kontenai/lib/access.ts) keeps attribution honest rather than
 * inventing an actor, and matches what the manual button would have recorded.
 */
async function resolveKontenAiAutomationActor(supabase: AdminClient, preferred: string | null): Promise<string> {
  if (preferred) return preferred;

  const { data: role } = await supabase.from("roles").select("id").eq("key", "super_admin").maybeSingle();
  if (!role) throw new NonRetryableJobError("Role super_admin tidak ditemukan -- tidak ada aktor untuk atribusi baris KontenAI otomatis");

  const { data: actor } = await supabase
    .from("employees")
    .select("id")
    .eq("role_id", role.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!actor) throw new NonRetryableJobError("Tidak ada karyawan Super Admin aktif -- tidak ada aktor untuk atribusi baris KontenAI otomatis");

  return actor.id;
}

/**
 * The beauty half of the automated pipeline: one loonars_content_items row
 * (hook/caption/script_notes/cta, drafted daily by
 * loonars_beauty_content_ideas_draft) through AI Director -> Storyboard Engine
 * -> footage analysis + Asset Selector -> render job.
 *
 * Beauty needs its own handler because it has no kpi_task. 0184 scoped the
 * pipeline to villa + beauty by adding 'beauty' to kontenai_automation_dispatch's
 * content_focus filter, but kpi_tasks.content_focus only permits
 * ('leasehold_sales','occupancy','general') (0123) -- so that branch could
 * never match and beauty was automated in name only, reachable exclusively via
 * the manual "Kirim ke KontenAI" button. Beauty content lives in
 * loonars_content_items, which is what this dispatches from.
 *
 * Deliberately stops at the render job. Villa continues into Content Studio
 * (kontenai_auto_bridge_to_studio) because a kpi_task gives it a branch, a
 * division and a verifier; a beauty item has none of those, so who reviews and
 * publishes a beauty video is an open decision -- the finished render shows up
 * on the Loonars Beauty board against the item it came from, and a human takes
 * it from there.
 */
async function processKontenAiAutoProduceBeauty(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as KontenAiAutoProduceBeautyJobPayload;

  const { data: item, error: itemError } = await supabase
    .from("loonars_content_items")
    .select("id, category, platform, title, hook, caption, script_notes, cta, product_name, created_by, kontenai_creative_brief_id")
    .eq("id", payload.content_item_id)
    .is("deleted_at", null)
    .single();
  if (itemError || !item) throw new Error(`loonars_content_item ${payload.content_item_id} not found: ${itemError?.message}`);
  if (item.kontenai_creative_brief_id) return { skipped: true, reason: "content item already sent to KontenAI" };

  const createdBy = await resolveKontenAiAutomationActor(supabase, item.created_by);
  const platform: DirectorPlatform = item.platform === "tiktok" ? "tiktok" : "instagram";
  const objective: DirectorObjective = beautyObjectiveForCategory(item.category);
  const performanceNote = await buildRecentPerformanceNote(supabase, "beauty");
  const campaignGoal = `${buildBeautyCampaignGoal(item)}${performanceNote}`;

  const assets = await listAnalyzedAssetsForDirector(supabase, { productProject: item.product_name, platform, limit: 20 });
  const directorResult = await generateCreativeBrief({
    objective,
    platform,
    targetAudience: BEAUTY_TARGET_AUDIENCE,
    productProject: item.product_name,
    campaignGoal,
    assets: assets.map((asset) => ({
      title: asset.title,
      assetType: asset.assetType,
      aiDescription: asset.aiDescription,
      aiTags: asset.aiTags,
      aiCategory: asset.aiCategory,
      aiMood: asset.aiMood,
    })),
  });

  const brief = await createKontenAiCreativeBrief(supabase, {
    objective,
    platform,
    targetAudience: BEAUTY_TARGET_AUDIENCE,
    productProject: item.product_name,
    campaignGoal,
    bigIdea: directorResult.bigIdea,
    hook: directorResult.hook,
    keyMessage: directorResult.keyMessage,
    targetEmotion: directorResult.targetEmotion,
    cta: directorResult.cta,
    contentAngle: directorResult.contentAngle,
    productionDirection: directorResult.productionDirection,
    referencedAssetIds: assets.map((asset) => asset.id),
    contentFocus: "beauty",
    createdBy,
  });

  const sceneDrafts = await generateStoryboardFromBrief({
    platform: brief.platform,
    objective: brief.objective,
    bigIdea: brief.big_idea,
    hook: brief.hook,
    keyMessage: brief.key_message,
    targetEmotion: brief.target_emotion,
    cta: brief.cta,
    contentAngle: brief.content_angle,
  });

  const draftScenes: KontenAiStoryboardScene[] = sceneDrafts.map((draft, index) => ({
    ...draft,
    id: generateAutomationSceneId(),
    order: index,
    selectedAssetId: null,
    assetMatches: [],
  }));

  const storyboard = await createKontenAiStoryboard(supabase, {
    creativeBriefId: brief.id,
    title: `Storyboard: ${item.title}`,
    scenes: draftScenes,
    createdBy,
  });

  const visionOutcome = await analyzeBrandFootageForRun(supabase, "beauty");

  const assetPool = await listAnalyzedAssetLibrary(supabase, { company: "beauty" });
  const matches = matchAssetsToScenes(draftScenes, assetPool);
  const selectedScenes: KontenAiStoryboardScene[] = draftScenes.map((scene, index) => ({
    ...scene,
    selectedAssetId: matches[index].selectedAssetId,
    assetMatches: matches[index].assetMatches,
  }));

  // The brief and storyboard are kept even when this throws: they are real work
  // product, and the content item stays unlinked so the next tick retries from
  // a clean state once footage exists.
  if (!selectedScenes.every((scene) => scene.selectedAssetId)) {
    throw new NonRetryableJobError(
      `Asset Library belum punya footage beauty yang bisa dipakai untuk "${item.title}" (${visionOutcome.analyzed} dianalisis, ${visionOutcome.failed} gagal dibaca pada run ini) -- tambahkan footage ke folder beauty lalu jalankan lagi.`,
    );
  }

  const updatedStoryboard = await updateKontenAiStoryboardScenes(supabase, storyboard.id, selectedScenes, createdBy);
  const renderJob = await createKontenAiRenderJob(supabase, { storyboardId: updatedStoryboard.id, createdBy });

  await supabase
    .from("loonars_content_items")
    .update({ kontenai_creative_brief_id: brief.id, status: "draft", updated_at: new Date().toISOString() })
    .eq("id", item.id);

  return {
    contentItemId: item.id,
    creativeBriefId: brief.id,
    storyboardId: updatedStoryboard.id,
    renderJobId: renderJob.id,
    footageAnalyzed: visionOutcome.analyzed,
    footageFailed: visionOutcome.failed,
  };
}

/**
 * Bridges one completed automation render into Content Studio: moves the
 * video from kontenai-renders into markom-content-submissions (see
 * lib/kontenai/content-studio-bridge.ts -- the only bucket
 * deleteSubmissionMediaFromStorage cleans up on publish), creates the
 * submission row, then enqueues content_submission_review so it gets a real
 * AI score the same way any other submission does. If that review approves
 * it (score >= 8.5), the existing auto-schedule + 5-minute publish worker
 * (app/api/social/publish-content) take it the rest of the way to actually
 * going live and deleting the video afterward -- nothing new needed there.
 */
async function processKontenAiAutoBridgeToStudio(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as KontenAiAutoBridgeToStudioJobPayload;

  const { data: renderJob, error: renderJobError } = await supabase
    .from("kontenai_render_jobs")
    .select("id, status, output_storage_path, storyboard_id")
    .eq("id", payload.render_job_id)
    .single();
  if (renderJobError || !renderJob) throw new Error(`Render job ${payload.render_job_id} not found: ${renderJobError?.message}`);
  if (renderJob.status !== "completed" || !renderJob.output_storage_path) {
    return { skipped: true, reason: `render job status is ${renderJob.status}, not completed yet` };
  }

  const { data: storyboard, error: storyboardError } = await supabase
    .from("kontenai_storyboards")
    .select("id, creative_brief_id")
    .eq("id", renderJob.storyboard_id)
    .single();
  if (storyboardError || !storyboard) throw new Error(`Storyboard for render job ${renderJob.id} not found: ${storyboardError?.message}`);

  const { data: brief, error: briefError } = await supabase
    .from("kontenai_creative_briefs")
    .select("id, platform, kpi_task_id")
    .eq("id", storyboard.creative_brief_id)
    .single();
  if (briefError || !brief || !brief.kpi_task_id) throw new Error(`Automation brief for storyboard ${storyboard.id} not found or has no kpi_task_id`);

  const { data: existingSubmission } = await supabase
    .from("markom_content_submissions")
    .select("id")
    .eq("task_id", brief.kpi_task_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (existingSubmission) return { skipped: true, reason: "submission already exists for this task" };

  const { data: task, error: taskError } = await supabase
    .from("kpi_tasks")
    .select("id, title, description, content_focus, branch_id, division_id, created_by")
    .eq("id", brief.kpi_task_id)
    .single();
  if (taskError || !task) throw new Error(`kpi_task ${brief.kpi_task_id} not found: ${taskError?.message}`);
  if (!task.created_by) throw new NonRetryableJobError(`kpi_task ${task.id} has no created_by -- can't attribute the Content Studio submission to an actor`);
  const createdBy = task.created_by;

  const moved = await moveRenderOutputToContentStudio(supabase, {
    sourcePath: renderJob.output_storage_path,
    submissionOwnerId: createdBy,
  });

  const caption = extractCaptionFromDescription(task.description, task.title);

  const submission = await createContentSubmission(supabase, {
    task_id: task.id,
    beauty_content_item_id: null,
    branch_id: task.branch_id,
    division_id: task.division_id,
    content_focus: task.content_focus as "leasehold_sales" | "occupancy" | "beauty",
    platform: brief.platform as "instagram" | "tiktok",
    submitted_by: createdBy,
    media_type: "video",
    storage_path: moved.storagePath,
    public_url: moved.publicUrl,
    caption,
    created_by: createdBy,
    is_automation_generated: true,
  });

  await supabase.from("ai_job_queue").insert({ job_type: "content_submission_review", payload: { submission_id: submission.id } });

  return { submissionId: submission.id };
}

function zernioProductForFocus(focus: string): ZernioProduct {
  return focus === "beauty" ? "beauty" : "property";
}

/**
 * Re-polls Zernio for one 'published' (or already-'failed', to pick up the
 * real error detail -- see reconcileZernioPublishStatus's doc) submission
 * whose per-platform status wasn't final yet at publish time (see 0170's
 * migration doc) -- updates zernio_publish_status/zernio_permalink with the
 * real current state, or flips/refines the submission to 'failed' with
 * Zernio's actual errorCategory/errorMessage if Zernio now reports the
 * platform publish failed. A submission whose status is already 'published'
 * in Zernio's own terms is left with nothing to do (dispatch's WHERE clause
 * won't even enqueue it again once that's true).
 */
async function processZernioPublishReconcile(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as ZernioPublishReconcileJobPayload;

  const { data: submission, error: submissionError } = await supabase
    .from("markom_content_submissions")
    .select("id, content_focus, zernio_post_id, status, media_type, storage_path")
    .eq("id", payload.submission_id)
    .single();
  if (submissionError || !submission) throw new Error(`Content submission ${payload.submission_id} not found: ${submissionError?.message}`);
  if (!["published", "failed"].includes(submission.status) || !submission.zernio_post_id) {
    return { skipped: true, reason: `submission status is ${submission.status}, nothing to reconcile` };
  }

  const product = zernioProductForFocus(submission.content_focus);
  const result = await getZernioPostStatus(submission.zernio_post_id, product);

  const failed = result.status === "failed";
  const failureReason = failed
    ? [result.errorCategory, result.errorMessage].filter(Boolean).join(": ") || "Zernio melaporkan publish ke platform gagal (tidak ada detail error)"
    : undefined;

  await reconcileZernioPublishStatus(supabase, submission.id, {
    zernioPublishStatus: result.status,
    zernioPermalink: result.permalink,
    failed,
    failureReason,
  });

  // Only now -- once Zernio's own status confirms 'published' (the platform
  // actually finished fetching/publishing it), not merely accepted at
  // createPost time -- is it safe to remove the source media (video, or
  // photo + carousel). Deleting any earlier raced a real Instagram fetch
  // straight into "couldn't fetch your media from the URL" because we'd
  // already removed it.
  if (result.status === "published") {
    await deleteSubmissionMediaFromStorage(supabase, submission.id, submission.storage_path).catch(() => undefined);
  }

  return { zernioStatus: result.status, permalink: result.permalink, failed, errorMessage: result.errorMessage, errorCategory: result.errorCategory, errorSource: result.errorSource };
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

type CompetitorLogRow = { hook: string | null; caption: string | null; hashtags: string | null; engagement_notes: string | null; content_type: string | null; competitor: { handle?: string; platform?: string } | null };

/** Shared by every AI call that reads social_competitor_content_logs (checklist context, weekly audit, competitor comparison) -- one formatted one-liner per manually-logged competitor post. */
function formatCompetitorNotes(logs: CompetitorLogRow[]): string[] {
  return logs.map((log) => {
    const competitor = log.competitor;
    const parts = [`@${competitor?.handle ?? "?"} (${competitor?.platform ?? "?"}, ${log.content_type ?? "konten"})`];
    if (log.hook) parts.push(`hook: "${log.hook}"`);
    if (log.hashtags) parts.push(`hashtag: ${log.hashtags}`);
    if (log.engagement_notes) parts.push(`engagement: ${log.engagement_notes}`);
    return `- ${parts.join(", ")}`;
  });
}

/** Latest own-account snapshot (if any capture has run yet) + recent human-logged competitor observations + all registered competitor handles for THIS focus (so AI searches their public activity itself even with zero manual logs yet) + the latest leasehold-vs-competitor comparison (0124) -- real data fed into the checklist prompt instead of relying on generic web search alone. Missing platforms (not configured, or no capture has run yet) are simply omitted, not an error. Competitor queries are scoped to `focus` (0125 made social_competitor_accounts span all 3 product lines) so a leasehold checklist never sees occupancy/beauty competitors mixed in, and vice versa. */
async function gatherContentPlannerContext(supabase: AdminClient, focus: ChecklistContentFocus): Promise<ContentPlannerContext> {
  const [{ data: igSnapshot }, { data: ttSnapshot }, { data: competitorLogs }, { data: competitorAccounts }, { data: comparison }] = await Promise.all([
    supabase.from("social_account_snapshots").select("*").eq("platform", "instagram").eq("product_line", "property").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("social_account_snapshots").select("*").eq("platform", "tiktok").eq("product_line", "property").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id!inner(handle, platform, content_focus)")
      .eq("competitor.content_focus", focus)
      .order("logged_at", { ascending: false })
      .limit(10),
    supabase.from("social_competitor_accounts").select("platform, handle").eq("is_active", true).eq("content_focus", focus),
    supabase.from("social_leasehold_competitor_comparisons").select("comparison").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const comparisonData = comparison?.comparison as { gaps?: string[]; recommendations?: string[] } | null;

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
    competitorNotes: formatCompetitorNotes((competitorLogs ?? []) as CompetitorLogRow[]),
    competitorHandles: (competitorAccounts ?? []).map((c) => ({ platform: c.platform, handle: c.handle })),
    competitorComparison: comparisonData ? { gaps: comparisonData.gaps ?? [], recommendations: comparisonData.recommendations ?? [] } : null,
  };
}

/** One Gemini attempt to research + draft exactly 3 Markom checklist items, then inserts them directly (no human approval gate -- matches kpi_assign_tasks' existing behavior when a Branch Manager creates a checklist by hand) and notifies the team, same category/notification shape kpi_assign_tasks already uses. */
/** Distinct marker per focus so markom_run_ai_checklist_dispatch's zero-pending gate counts each track independently -- a branch with 0 pending occupancy items but 3 pending leasehold-sales items should still get a fresh occupancy batch, and vice versa. */
const CHECKLIST_AI_MARKER: Record<"leasehold_sales" | "occupancy", string> = {
  leasehold_sales: "(Dibuat otomatis oleh AI berdasarkan riset tren viral & iklan kompetitor -- fokus PENJUALAN LEASEHOLD.)",
  occupancy: "(Dibuat otomatis oleh AI berdasarkan riset tren viral & iklan kompetitor -- fokus OCCUPANCY/booking tamu.)",
};

async function processMarkomChecklistDraft(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as MarkomChecklistDraftJobPayload;
  const focus = payload.focus ?? "leasehold_sales";
  const context = await gatherContentPlannerContext(supabase, focus);
  const items = await researchAndGenerateChecklist(payload.branch_name, context, focus);

  const now = new Date();
  // 1 day, not 3 -- checklist generation is now capped at 1 item/day per
  // focus (0144), so the due date matches that daily cadence instead of
  // the old 3-day batch window.
  const dueDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const taskRows = items.map((item) => ({
    division_id: payload.division_id,
    branch_id: payload.branch_id,
    title: item.title,
    description: `${item.description}\n\n${CHECKLIST_AI_MARKER[focus]}`,
    content_focus: focus,
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

  const focusLabel = focus === "occupancy" ? "occupancy/booking" : "penjualan leasehold";
  for (const member of team ?? []) {
    await supabase.from("mkc_notifications").insert({
      user_id: member.id,
      type: "kpi_task",
      category: "markom_new_task",
      title: `Checklist Markom baru dari AI (${focusLabel})`,
      body: `AI membuat ${taskRows.length} task baru (fokus ${focusLabel}) berdasarkan riset tren & kompetitor. Selesaikan sebelum ${dueDate.toLocaleDateString("id-ID")}.`,
      link: "/markom",
    });
  }

  return { branchId: payload.branch_id, focus, taskCount: taskRows.length };
}

/** Shared by processMetaAdsLaunch and processMetaAdsResearch -- both need the same project + photo lookup, with the same "no photos yet" guard. */
async function loadProjectWithPhotos(supabase: AdminClient, projectId: string) {
  const { data: project, error: projectError } = await supabase
    .from("crm_projects")
    .select("id, name, city, project_type, offering_type, branch_id, product_description")
    .eq("id", projectId)
    .single();
  if (projectError || !project) throw new NonRetryableJobError(`Project ${projectId} not found: ${projectError?.message}`);

  const { data: photos } = await supabase
    .from("crm_project_photos")
    .select("id, public_url, caption, media_type")
    .eq("project_id", project.id)
    .is("deleted_at", null);
  if (!photos || photos.length === 0) {
    throw new NonRetryableJobError(`No photos uploaded for project "${project.name}" -- Markom must upload real photos before AI can launch an ad`);
  }

  return { project, photos };
}

/**
 * Recent past drafts/launches for this project, so researchAndDraftAd can be
 * told explicitly not to repeat itself (see AdDraftInput.previousDrafts) --
 * without this, every "Riset" click sent the exact same project inputs and
 * Gemini kept converging on the same headline/primaryText across different
 * photos. Excludes 'failed' rows (their headline is "Riset gagal", not real
 * ad copy) and caps at 5 -- enough to steer variety without bloating the
 * prompt with the project's entire ad history.
 */
async function loadPreviousAdDrafts(supabase: AdminClient, projectId: string): Promise<{ headline: string; primaryText: string }[]> {
  const { data } = await supabase
    .from("meta_ad_campaigns")
    .select("headline, primary_text")
    .eq("project_id", projectId)
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(5);
  return (data ?? []).map((d) => ({ headline: d.headline, primaryText: d.primary_text }));
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
  const previousDrafts = await loadPreviousAdDrafts(supabase, project.id);

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
    offeringType: project.offering_type,
    productDescription: project.product_description,
    availablePhotos: photos.map((p) => ({ id: p.id, caption: p.caption, mediaType: p.media_type })),
    targetCities: project.project_type === "villa" && project.offering_type === "sale" ? LEASEHOLD_TARGET_CITIES : undefined,
    previousDrafts,
  });
  const photoById = new Map(photos.map((p) => [p.id, p]));
  const selectedPhotos = draft.photoIds.map((id) => photoById.get(id)).filter((p): p is (typeof photos)[number] => Boolean(p));
  if (selectedPhotos.length === 0) throw new Error(`AI picked photos ${draft.photoIds.join(", ")} which are not in the available set`);
  const isVideoAd = selectedPhotos[0].media_type === "video";

  const isLeaseholdSale = project.project_type === "villa" && project.offering_type === "sale";
  const dailyBudgetIdr = Math.min(Math.max(draft.suggestedDailyBudgetIdr || 30_000, 20_000), remainingBudgetIdr);
  const targeting = isLeaseholdSale ? await getLeaseholdTargetGeoLocations() : await resolveGeoLocationsFromNames(draft.targetAreas, 25);
  // Real bug found: this column always stored the AI's own separate
  // targetAreas research field, even for leasehold-sale campaigns where
  // that field is never populated (researchAndDraftAd skips asking for it,
  // see areaResearchLine) -- the actual, deterministic LEASEHOLD_TARGET_CITIES
  // list used for real Meta targeting was never reflected here, so the "Area
  // target" line on /markom/ads either showed nothing or an incomplete echo
  // for villa-sale ads, even though Yogyakarta (and the rest of the list)
  // was genuinely being targeted on Meta's side.
  const targetAreasForDisplay = isLeaseholdSale ? LEASEHOLD_TARGET_CITIES : draft.targetAreas;

  try {
    const result = await launchWhatsAppLeadCampaign({
      projectName: project.name,
      photoUrls: isVideoAd ? [] : selectedPhotos.map((p) => p.public_url),
      videoUrl: isVideoAd ? selectedPhotos[0].public_url : undefined,
      headline: draft.headline,
      primaryText: draft.primaryText,
      description: draft.description,
      welcomeMessage: draft.welcomeMessage,
      dailyBudgetIdr,
      targeting,
    });

    const { data: inserted } = await supabase
      .from("meta_ad_campaigns")
      .insert({
        project_id: project.id,
        branch_id: project.branch_id,
        photo_id: selectedPhotos[0].id,
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
        target_areas: targetAreasForDisplay,
      })
      .select("id")
      .single();
    if (inserted) await insertAdCampaignPhotos(supabase, inserted.id, selectedPhotos.map((p) => p.id));

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
      photo_id: selectedPhotos[0].id,
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
      target_areas: targetAreasForDisplay,
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
    const previousDrafts = await loadPreviousAdDrafts(supabase, project.id);

    const draft = await researchAndDraftAd({
      projectName: project.name,
      projectCity: project.city,
      projectType: project.project_type,
      offeringType: project.offering_type,
      productDescription: project.product_description,
      availablePhotos: photos.map((p) => ({ id: p.id, caption: p.caption, mediaType: p.media_type })),
      targetCities: project.project_type === "villa" && project.offering_type === "sale" ? LEASEHOLD_TARGET_CITIES : undefined,
      previousDrafts,
    });
    const photoById = new Map(photos.map((p) => [p.id, p]));
    const selectedPhotos = draft.photoIds.map((id) => photoById.get(id)).filter((p): p is (typeof photos)[number] => Boolean(p));
    if (selectedPhotos.length === 0) throw new Error(`AI picked photos ${draft.photoIds.join(", ")} which are not in the available set`);

    // See processMetaAdsLaunch's comment on isLeaseholdSale/targetAreasForDisplay --
    // same fix here so the draft's displayed "Area target" line reflects the
    // real deterministic list this will actually be targeted to on launch,
    // not the AI's own separate (and for leasehold sale, never-populated)
    // targetAreas field.
    const isLeaseholdSale = project.project_type === "villa" && project.offering_type === "sale";
    const targetAreasForDisplay = isLeaseholdSale ? LEASEHOLD_TARGET_CITIES : draft.targetAreas;

    const { data: inserted, error: insertError } = await supabase
      .from("meta_ad_campaigns")
      .insert({
        project_id: project.id,
        branch_id: project.branch_id,
        photo_id: selectedPhotos[0].id,
        name: `${project.name} - Leads WA (Draft)`,
        headline: draft.headline,
        primary_text: draft.primaryText,
        description: draft.description,
        welcome_message: draft.welcomeMessage,
        daily_budget_idr: Math.max(draft.suggestedDailyBudgetIdr || 30_000, 20_000),
        status: "draft",
        launched_by: "human",
        research_summary: draft.targetSummary,
        target_areas: targetAreasForDisplay,
      })
      .select("id")
      .single();
    if (insertError || !inserted) throw new Error(`Failed to save ad draft: ${insertError?.message}`);
    await insertAdCampaignPhotos(supabase, inserted.id, selectedPhotos.map((p) => p.id));

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
/** One topic per job (0115) -- Gemini + Google Search grounding, upserted into ai_knowledge_bank. Isolated per topic so one failing (e.g. a transient search error) doesn't block the others from refreshing. */
async function processKnowledgeBankRefresh(job: JobRow) {
  const payload = job.payload as unknown as KnowledgeBankRefreshJobPayload;
  return processKnowledgeBankRefreshJob(payload.topic);
}

/** One-off (0117), one job per active sales employee -- personalized closing tip grounded in getSystemPrompt("crm")'s property knowledge bank (villa/subsidized-specific where the sales rep's own product is known). */
async function processSalesClosingTipsBroadcast(job: JobRow) {
  const payload = job.payload as unknown as SalesClosingTipsJobPayload;
  const productLabel =
    payload.product_type === "villa"
      ? "villa leasehold (investasi)"
      : payload.product_type === "subsidized"
        ? "rumah subsidi"
        : payload.product_type === "commercial"
          ? "rumah komersial"
          : "properti (produk spesifik belum tercatat di sistem untuk sales ini)";

  const tip = await askAI(
    await getSystemPrompt("crm"),
    `Buatkan SATU tips closing singkat, konkret, dan langsung bisa dipakai untuk sales berikut, khusus untuk produk yang dia jual -- gaya menyemangati untuk hari Minggu (santai tapi tetap actionable), maksimal 5-6 kalimat, dalam Bahasa Indonesia. Langsung ke isi, tanpa basa-basi pembuka panjang.\n\nNama sales: ${payload.sales_name}\nCabang: ${payload.branch_name}\nProduk yang dijual: ${productLabel}`,
    { temperature: 0.8, maxAttempts: 1 },
  );

  const message = `☀️ Tips Closing Hari Minggu untuk ${payload.sales_name}\n\n${tip}`;
  const sendResult = await sendWhatsAppText(payload.sales_phone, message);
  if (!sendResult.success) throw new Error(`Failed to send closing tip to ${payload.sales_name}: ${sendResult.error ?? "unknown"}`);
  return { salesId: payload.sales_id, sent: true };
}

async function processInvestorIntelligenceRefresh(job: JobRow) {
  const payload = job.payload as unknown as InvestorIntelligenceRefreshJobPayload;
  return processInvestorIntelligenceRefreshJob(payload.topic);
}

async function processCashflowIntelligenceRefresh(job: JobRow) {
  const payload = job.payload as unknown as CashflowIntelligenceRefreshJobPayload;
  return processCashflowIntelligenceRefreshJob(payload.topic);
}

/** Every active employees.phone with role kepala_cabang in a branch -- shared by the Sales Teaching Engine and the Cashflow Teaching Engine, both WhatsApp-only (no mkc_notifications row, no UI trace, per the owner's explicit ask). */
async function getKepalaCabangPhones(supabase: AdminClient, branchId: string): Promise<string[]> {
  const { data } = await supabase
    .from("employees")
    .select("phone, roles!inner(key)")
    .eq("branch_id", branchId)
    .eq("roles.key", "kepala_cabang")
    .eq("employment_status", "active")
    .is("deleted_at", null);
  return (data ?? []).map((row) => row.phone).filter((phone): phone is string => Boolean(phone));
}

/**
 * Weekly branch-wide Weekly Coaching for Kepala Cabang (0128, Sales
 * Teaching Engine) -- gathers real villa-leasehold prospect activity for
 * the branch (today, only Jogja -- crm_run_sales_teaching_weekly only
 * dispatches branches with an active villa project), generates the 8-
 * section briefing, and sends it directly via WhatsApp. No
 * mkc_notifications row -- this module must never appear in any menu.
 */
async function processSalesTeachingWeekly(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as SalesTeachingWeeklyJobPayload;

  const phones = await getKepalaCabangPhones(supabase, payload.branch_id);
  if (!phones.length) throw new Error(`No active Kepala Cabang phone found for branch ${payload.branch_name}`);

  // Scoped to villa-leasehold prospects only (crm_projects.project_type = 'villa'), per the owner's explicit ask that this module is villa-leasehold-only.
  const [{ data: activeProspects }, { count: newProspectCount7d }, { count: followUpCount7d }, { count: closings7d }, { count: closings30d }] = await Promise.all([
    supabase
      .from("prospects")
      .select("id, last_follow_up_at, created_at, crm_projects!inner(project_type)")
      .eq("branch_id", payload.branch_id)
      .eq("crm_projects.project_type", "villa")
      .is("deleted_at", null)
      .not("status", "in", "(closing,inactive)"),
    supabase
      .from("prospects")
      .select("id, crm_projects!inner(project_type)", { count: "exact", head: true })
      .eq("branch_id", payload.branch_id)
      .eq("crm_projects.project_type", "villa")
      .is("deleted_at", null)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("prospect_follow_ups")
      .select("id, prospects!inner(branch_id, crm_projects!inner(project_type))", { count: "exact", head: true })
      .eq("prospects.branch_id", payload.branch_id)
      .eq("prospects.crm_projects.project_type", "villa")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("prospects")
      .select("id, crm_projects!inner(project_type)", { count: "exact", head: true })
      .eq("branch_id", payload.branch_id)
      .eq("crm_projects.project_type", "villa")
      .eq("status", "closing")
      .not("closed_at", "is", null)
      .gte("closed_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("prospects")
      .select("id, crm_projects!inner(project_type)", { count: "exact", head: true })
      .eq("branch_id", payload.branch_id)
      .eq("crm_projects.project_type", "villa")
      .eq("status", "closing")
      .not("closed_at", "is", null)
      .gte("closed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const stuckCount = (activeProspects ?? []).filter((p) => new Date(p.last_follow_up_at ?? p.created_at).getTime() < cutoff).length;

  const now = new Date();
  const message = await generateWeeklySalesTeaching({
    branchName: payload.branch_name,
    periodLabel: `Minggu ${Math.ceil(now.getDate() / 7)}, ${now.getMonth() + 1}/${now.getFullYear()}`,
    activeProspectCount: (activeProspects ?? []).length,
    newProspectCount7d: newProspectCount7d ?? 0,
    stuckProspectCount: stuckCount,
    followUpCount7d: followUpCount7d ?? 0,
    closings7d: closings7d ?? 0,
    closings30d: closings30d ?? 0,
  });

  const fullMessage = `📊 Weekly Coaching — Cabang ${payload.branch_name}\n\n${message}`;
  for (const phone of phones) {
    const sendResult = await sendWhatsAppText(phone, fullMessage);
    if (!sendResult.success) throw new Error(`Failed to send weekly sales teaching to ${phone}: ${sendResult.error ?? "unknown"}`);
  }

  return { branchId: payload.branch_id, sentTo: phones.length };
}

/**
 * Low-balance Action Plan for Kepala Cabang (0129, Cashflow Teaching
 * Engine) -- root cause, risk level, and a concrete Action Plan, sent
 * directly via WhatsApp. No mkc_notifications row -- this module must
 * never appear in any menu.
 */
async function processCashflowActionPlan(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as CashflowActionPlanJobPayload;

  const phones = await getKepalaCabangPhones(supabase, payload.branch_id);
  if (!phones.length) throw new Error(`No active Kepala Cabang phone found for branch ${payload.branch_name}`);

  const [{ count: activeVillaProspectCount }, { count: closings30d }, { count: recentBalanceAlertCount14d }] = await Promise.all([
    supabase
      .from("prospects")
      .select("id, crm_projects!inner(project_type)", { count: "exact", head: true })
      .eq("branch_id", payload.branch_id)
      .eq("crm_projects.project_type", "villa")
      .is("deleted_at", null)
      .not("status", "in", "(closing,inactive)"),
    supabase
      .from("prospects")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", payload.branch_id)
      .eq("status", "closing")
      .not("closed_at", "is", null)
      .gte("closed_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("mkc_notifications")
      .select("id", { count: "exact", head: true })
      .eq("category", "branch_balance_alert")
      .contains("metadata", { branch_id: payload.branch_id })
      .gte("created_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  const message = await generateCashflowActionPlan({
    branchName: payload.branch_name,
    saldo: payload.saldo,
    thresholdAmount: payload.threshold,
    dayOfMonth: new Date().getDate(),
    activeVillaProspectCount: activeVillaProspectCount ?? 0,
    closings30d: closings30d ?? 0,
    recentBalanceAlertCount14d: recentBalanceAlertCount14d ?? 0,
  });

  const fullMessage = `🚨 Cashflow Action Plan — Cabang ${payload.branch_name}\n\n${message}`;
  for (const phone of phones) {
    const sendResult = await sendWhatsAppText(phone, fullMessage);
    if (!sendResult.success) throw new Error(`Failed to send cashflow action plan to ${phone}: ${sendResult.error ?? "unknown"}`);
  }

  return { branchId: payload.branch_id, sentTo: phones.length };
}

async function processOccupancyIntelligenceRefresh(job: JobRow) {
  const payload = job.payload as unknown as OccupancyIntelligenceRefreshJobPayload;
  return processOccupancyIntelligenceRefreshJob(payload.topic);
}

/**
 * Real per-property room counts from Kos (kos_remote, 0146 postgres_fdw
 * integration) for the background job -- NOT the user-facing
 * get_kos_occupancy() RPC (0147), which requires a real authenticated
 * session (auth.uid()) to pass its permission check and would reject a
 * service-role call with no user. get_kos_occupancy_internal() is the
 * same query with no permission gate, granted to service_role only (see
 * migration adding the Occupancy Teaching Engine).
 */
async function getOccupancySnapshot(supabase: AdminClient): Promise<OccupancyPropertySnapshot[]> {
  const { data, error } = await supabase.rpc("get_kos_occupancy_internal");
  if (error) throw new Error(`Failed to load occupancy snapshot: ${error.message}`);
  return (data ?? []).map((row: { property_name: string; total: number; terisi: number; kosong: number }) => ({
    propertyName: row.property_name,
    totalRooms: row.total,
    filledRooms: row.terisi,
    emptyRooms: row.kosong,
  }));
}

/**
 * Wed/Fri briefing for Management Property's Kepala Cabang (Occupancy
 * Teaching Engine) -- real per-property occupancy numbers from Kos, the
 * 7-section briefing, sent directly via WhatsApp. No mkc_notifications
 * row -- this module must never appear in any menu.
 */
async function processOccupancyTeachingBiweekly(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as OccupancyTeachingBiweeklyJobPayload;

  const phones = await getKepalaCabangPhones(supabase, payload.branch_id);
  if (!phones.length) throw new Error(`No active Kepala Cabang phone found for branch ${payload.branch_name}`);

  const properties = await getOccupancySnapshot(supabase);

  const now = new Date();
  const message = await generateOccupancyTeaching({
    branchName: payload.branch_name,
    periodLabel: now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" }),
    properties,
  });

  const fullMessage = `🏘️ Briefing Okupansi — Cabang ${payload.branch_name}\n\n${message}`;
  for (const phone of phones) {
    const sendResult = await sendWhatsAppText(phone, fullMessage);
    if (!sendResult.success) throw new Error(`Failed to send occupancy teaching to ${phone}: ${sendResult.error ?? "unknown"}`);
  }

  return { branchId: payload.branch_id, sentTo: phones.length, propertyCount: properties.length };
}

/**
 * Recent own-account Instagram posts, Zernio-first then direct Meta Graph
 * API fallback -- same precedence as capture-snapshots/route.ts. Shared by
 * the weekly content audit and the leasehold competitor comparison, both of
 * which need real per-post data instead of account-level aggregates. A
 * transient failure on either path returns an empty array rather than
 * throwing, since both callers already have their own "no post data"
 * fallback behavior.
 */
async function getOwnRecentInstagramPosts(limit = 12): Promise<Awaited<ReturnType<typeof getRecentInstagramMediaPerformance>>> {
  const zernioInstagramAccount = isZernioConfigured() ? (await listZernioAccounts("instagram").catch(() => []))[0] : undefined;
  if (zernioInstagramAccount) {
    try {
      return await getRecentZernioMediaPerformance(zernioInstagramAccount.id, "instagram", limit);
    } catch (err) {
      logger.error("getOwnRecentInstagramPosts: Zernio fetch failed", { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
  if (isInstagramConfigured()) {
    try {
      return await getRecentInstagramMediaPerformance(limit);
    } catch (err) {
      logger.error("getOwnRecentInstagramPosts: Meta Graph API fetch failed", { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  }
  return [];
}

/** Loonars Beauty's own Zernio account (0126) -- Zernio-only, no legacy direct-API fallback since beauty never had one. */
async function getBeautyRecentInstagramPosts(limit = 12): Promise<Awaited<ReturnType<typeof getRecentZernioMediaPerformance>>> {
  if (!isZernioConfigured("beauty")) return [];
  const account = (await listZernioAccounts("instagram", "beauty").catch(() => []))[0];
  if (!account) return [];
  try {
    return await getRecentZernioMediaPerformance(account.id, "instagram", limit, "beauty");
  } catch (err) {
    logger.error("getBeautyRecentInstagramPosts: Zernio fetch failed", { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

/**
 * Twice-weekly reminder to the Markom team of their own Instagram/TikTok
 * content score -- reuses the already-computed social_weekly_evaluations
 * row (property's weekly content audit, auditWeeklyContentPerformance) so
 * this never fires its own extra Gemini/Google Search call. The Monday
 * firing reports the fresh audit that week's cron just generated; the
 * Thursday firing re-sends the SAME (still-current) week's score as a
 * mid-week reminder -- deliberately not a fresh analysis, since the
 * underlying account data only meaningfully changes week to week.
 * growthSignal === 'below_benchmark' (the AI's own relative-benchmark
 * verdict, not a hardcoded number here) switches the message to an
 * explicit teguran (reprimand) instead of a neutral report.
 */
async function processMarkomContentPerformanceBroadcast(supabase: AdminClient) {
  const { data: latest, error: fetchError } = await supabase
    .from("social_weekly_evaluations")
    .select("week_start, audit")
    .order("week_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fetchError) throw new Error(`Failed to load latest weekly evaluation: ${fetchError.message}`);
  if (!latest?.audit) return { sent: 0, reason: "no evaluation yet" };

  const audit = latest.audit as unknown as WeeklyContentAuditResult;
  const s = audit.scores;
  const isLow = audit.growthSignal === "below_benchmark";

  const weekLabel = new Date(latest.week_start).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Makassar" });
  const scoreLines = [
    `Hook: ${s.hook}/10`,
    `Value: ${s.value}/10`,
    `CTA: ${s.cta}/10`,
    `Kesesuaian Niche: ${s.nicheFit}/10`,
    `Potensi Engagement: ${s.engagementPotential}/10`,
    `Optimasi Platform: ${s.platformOptimization}/10`,
    `Rata-rata: ${s.overall}/10`,
  ].join("\n");
  const recommendationLines = audit.recommendations.map((r) => `- ${r}`).join("\n");

  const message = isLow
    ? `⚠️ TEGURAN — Performa Konten Instagram & TikTok Minggu ${weekLabel}\n\nSkor performa konten masih DI BAWAH TARGET (growth signal: below benchmark):\n${scoreLines}\n\n${audit.narrative}\n\nSegera perbaiki minggu ini:\n${recommendationLines}`
    : `📊 Evaluasi Konten Instagram & TikTok — Minggu ${weekLabel}\n\n${scoreLines}\n\n${audit.narrative}${recommendationLines ? `\n\nRekomendasi:\n${recommendationLines}` : ""}`;

  const { data: markomEmployees, error: employeesError } = await supabase
    .from("employees")
    .select("phone, divisions!inner(name)")
    .eq("divisions.name", "Marketing & Komunikasi")
    .eq("employment_status", "active")
    .is("deleted_at", null);
  if (employeesError) throw new Error(`Failed to load Markom employees: ${employeesError.message}`);

  const phones = (markomEmployees ?? []).map((e) => e.phone).filter((phone): phone is string => Boolean(phone));

  let sent = 0;
  for (const phone of phones) {
    const result = await sendWhatsAppText(phone, message);
    if (result.success) sent += 1;
  }

  return { weekStart: latest.week_start, growthSignal: audit.growthSignal, sent, total: phones.length };
}

async function processSocialWeeklyEvaluation(supabase: AdminClient) {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const lastWeekStartDate = new Date(weekStart);
  lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  const lastWeekStart = lastWeekStartDate.toISOString().slice(0, 10);

  const [{ data: igThisWeek }, { data: igLastWeek }, { data: ttThisWeek }, { data: competitorLogs }] = await Promise.all([
    supabase.from("social_account_snapshots").select("*").eq("platform", "instagram").eq("product_line", "property").gte("captured_at", weekStart).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_account_snapshots")
      .select("*")
      .eq("platform", "instagram")
      .eq("product_line", "property")
      .gte("captured_at", lastWeekStart)
      .lt("captured_at", weekStart)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("social_account_snapshots").select("*").eq("platform", "tiktok").eq("product_line", "property").gte("captured_at", weekStart).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id!inner(handle, platform, content_focus)")
      .eq("competitor.content_focus", "leasehold_sales")
      .gte("logged_at", weekStart)
      .order("logged_at", { ascending: false })
      .limit(15),
  ]);

  const competitorNotes = formatCompetitorNotes((competitorLogs ?? []) as CompetitorLogRow[]);

  // Live per-post data (captions + real per-post engagement) -- the daily
  // snapshot only stores account-level aggregates, so a genuine
  // hook/value/CTA audit needs a fresh read of actual recent posts (empty
  // array falls back to account-level-only scoring, same as before).
  const instagramTopPosts = (await getOwnRecentInstagramPosts(12)).filter((p) => p.timestamp >= weekStart);

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
 * Phase 2 (0124): our own recent content vs registered leasehold
 * competitors' public content -- see compareLeaseholdCompetitorContent
 * (lib/ai/domains/markom.ts) for the actual AI reasoning. Own posts come
 * from the same Zernio-first/Meta-fallback source the weekly audit uses;
 * competitor side is whatever's been manually logged (usually nothing yet)
 * plus every registered active competitor handle for the AI to research
 * itself via Google Search grounding.
 */
async function processLeaseholdCompetitorComparison(supabase: AdminClient) {
  const [ourPosts, { data: igSnapshot }, { data: competitorLogs }, { data: competitorAccounts }] = await Promise.all([
    getOwnRecentInstagramPosts(10),
    supabase.from("social_account_snapshots").select("followers_count").eq("platform", "instagram").eq("product_line", "property").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id!inner(handle, platform, content_focus)")
      .eq("competitor.content_focus", "leasehold_sales")
      .order("logged_at", { ascending: false })
      .limit(15),
    supabase.from("social_competitor_accounts").select("platform, handle").eq("is_active", true).eq("content_focus", "leasehold_sales"),
  ]);

  const result = await compareLeaseholdCompetitorContent({
    ourRecentPosts: ourPosts.map((p) => ({
      caption: p.caption,
      mediaType: p.mediaType,
      reach: p.reach,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      permalink: p.permalink,
    })),
    ourFollowersCount: igSnapshot?.followers_count ?? 0,
    competitorHandles: (competitorAccounts ?? []).map((c) => ({ platform: c.platform, handle: c.handle })),
    competitorNotes: formatCompetitorNotes((competitorLogs ?? []) as CompetitorLogRow[]),
  });

  const { error: insertError } = await supabase.from("social_leasehold_competitor_comparisons").insert({
    narrative: result.narrative,
    comparison: result as unknown as Json,
  });
  if (insertError) throw new Error(`Failed to save leasehold competitor comparison: ${insertError.message}`);

  return { gapsFound: result.gaps.length };
}

interface CompetitorDiscoveryJobPayload {
  focus: CompetitorFocus;
}

/** Active competitors per focus is capped so an auto-discovery rerun doesn't grow the list unbounded -- quality over quantity for what's meant to be a small reference set. */
const COMPETITOR_DISCOVERY_CAP = 6;

/**
 * AI finds its own reference competitors (0125) instead of a human
 * registering them one by one -- dispatched weekly for all 3 foci
 * (leasehold_sales, occupancy, beauty) plus on-demand per Content Planner
 * tab. Property foci use discoverPropertyCompetitors (markom.ts); beauty
 * uses discoverBeautyCompetitors (loonars-beauty.ts) -- kept as two
 * separate AI calls with their own domain system prompt so beauty
 * reasoning never touches property knowledge and vice versa, same
 * separation already enforced everywhere else in this codebase.
 * insertDiscoveredCompetitors silently skips anything already registered
 * (any source, any focus/platform match on handle), so reruns never
 * duplicate a manually-added or previously-discovered competitor.
 */
async function processCompetitorDiscovery(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as CompetitorDiscoveryJobPayload;
  const focus = payload.focus;

  const activeCount = await countActiveCompetitors(supabase, focus);
  const remaining = COMPETITOR_DISCOVERY_CAP - activeCount;
  if (remaining <= 0) return { focus, discovered: 0, skipped: "cap reached" };

  const discovered = focus === "beauty" ? await discoverBeautyCompetitors() : await discoverPropertyCompetitors(focus as ChecklistContentFocus);
  const inserted = await insertDiscoveredCompetitors(
    supabase,
    focus,
    discovered.slice(0, remaining).map((d) => ({ platform: d.platform, handle: d.handle, displayName: d.displayName, notes: d.reason || null })),
  );

  return { focus, discovered: inserted };
}

interface HashtagBankJobPayload {
  focus: CompetitorFocus;
  platform: "instagram" | "tiktok";
}

/** Wholesale-refreshes markom_hashtag_bank for one (focus, platform) -- weekly automatic dispatch (all 6 combos) plus on-demand per Content Planner tab, same trigger pattern as competitor discovery. */
async function processMarkomHashtagBankRefresh(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as HashtagBankJobPayload;
  const { focus, platform } = payload;

  const items = focus === "beauty" ? await generateBeautyHashtagBank(platform) : await generateHashtagBank(focus as ChecklistContentFocus, platform);
  await replaceHashtagBank(supabase, focus, platform, items);

  return { focus, platform, count: items.length };
}

/**
 * Monthly rollup: reads the month's already-computed weekly audits
 * (social_weekly_evaluations) and this month's first/last Instagram
 * follower snapshot, computes growth/best-week/worst-week in code (never
 * left to the model), then asks generateMonthlyContentReportNarrative for
 * narrative + recommendations only. Property only (leasehold_sales +
 * occupancy share one account) -- see migration 0251's doc comment for why.
 * Skips (no row written) if there's no weekly data for the month yet,
 * rather than generating a report over nothing.
 */
async function processSocialMonthlyContentReport(supabase: AdminClient) {
  const now = new Date();
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const firstOfPrevMonth = new Date(Date.UTC(firstOfThisMonth.getUTCFullYear(), firstOfThisMonth.getUTCMonth() - 1, 1));
  const monthStart = firstOfPrevMonth.toISOString().slice(0, 10);
  const monthEndExclusive = firstOfThisMonth.toISOString().slice(0, 10);

  const [{ data: weeklyRows }, { data: igStart }, { data: igEnd }] = await Promise.all([
    supabase.from("social_weekly_evaluations").select("week_start, audit").gte("week_start", monthStart).lt("week_start", monthEndExclusive).order("week_start", { ascending: true }),
    supabase
      .from("social_account_snapshots")
      .select("followers_count")
      .eq("platform", "instagram")
      .eq("product_line", "property")
      .gte("captured_at", monthStart)
      .lt("captured_at", monthEndExclusive)
      .order("captured_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("social_account_snapshots")
      .select("followers_count")
      .eq("platform", "instagram")
      .eq("product_line", "property")
      .gte("captured_at", monthStart)
      .lt("captured_at", monthEndExclusive)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const weeks = (weeklyRows ?? [])
    .filter((r) => r.audit !== null)
    .map((r) => ({ weekStart: r.week_start, audit: r.audit as unknown as WeeklyContentAuditResult }));
  if (weeks.length === 0) return { monthStart, skipped: "no weekly evaluations this month" };

  let bestWeek: MonthlyReportWeekSummary | null = null;
  let worstWeek: MonthlyReportWeekSummary | null = null;
  let scoreSum = 0;
  for (const w of weeks) {
    const summary: MonthlyReportWeekSummary = { weekStart: w.weekStart, overall: w.audit.scores.overall, growthSignal: w.audit.growthSignal };
    scoreSum += summary.overall;
    if (!bestWeek || summary.overall > bestWeek.overall) bestWeek = summary;
    if (!worstWeek || summary.overall < worstWeek.overall) worstWeek = summary;
  }
  const avgWeeklyScore = Math.round((scoreSum / weeks.length) * 10) / 10;

  const followersStart = igStart?.followers_count ?? null;
  const followersEnd = igEnd?.followers_count ?? null;
  const followerGrowthPct = followersStart && followersStart > 0 && followersEnd !== null ? Math.round(((followersEnd - followersStart) / followersStart) * 1000) / 10 : null;

  const monthLabel = new Date(`${monthStart}T00:00:00Z`).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "Asia/Makassar" });

  const computed: MonthlyContentReportComputed = { monthLabel, followersStart, followersEnd, followerGrowthPct, avgWeeklyScore, bestWeek, worstWeek, weeksCovered: weeks.length };
  const weeklyNarratives = weeks.map((w) => `${w.weekStart}: ${w.audit.narrative}`);
  const { narrative, recommendations } = await generateMonthlyContentReportNarrative(computed, weeklyNarratives);

  const report = { ...computed, narrative, recommendations };
  const { error } = await supabase.from("social_monthly_content_reports").upsert({ month_start: monthStart, report: report as unknown as Json, narrative }, { onConflict: "month_start" });
  if (error) throw new Error(`Failed to save monthly content report: ${error.message}`);

  return { monthStart, weeksCovered: weeks.length };
}

/**
 * Beauty's own version of processSocialWeeklyEvaluation (0111/0123) -- the
 * scored hook/value/CTA/niche-fit/engagement/platform-optimization audit
 * Content Audit shows, computed from Beauty's own real Zernio per-post data
 * instead of property's. This was the missing piece that made Content
 * Audit look leasehold-only: loonars_weekly_evaluations (processLoonars
 * BeautyWeeklyEvaluation below) is a different, narrower thing entirely
 * (content-ratio-vs-target + orders), never a per-post score.
 */
async function processLoonarsBeautyWeeklyContentAudit(supabase: AdminClient) {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const lastWeekStartDate = new Date(weekStart);
  lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  const lastWeekStart = lastWeekStartDate.toISOString().slice(0, 10);

  const [{ data: igThisWeek }, { data: igLastWeek }, { data: ttThisWeek }, { data: competitorLogs }] = await Promise.all([
    supabase.from("social_account_snapshots").select("*").eq("platform", "instagram").eq("product_line", "beauty").gte("captured_at", weekStart).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_account_snapshots")
      .select("*")
      .eq("platform", "instagram")
      .eq("product_line", "beauty")
      .gte("captured_at", lastWeekStart)
      .lt("captured_at", weekStart)
      .order("captured_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("social_account_snapshots").select("*").eq("platform", "tiktok").eq("product_line", "beauty").gte("captured_at", weekStart).order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id!inner(handle, platform, content_focus)")
      .eq("competitor.content_focus", "beauty")
      .gte("logged_at", weekStart)
      .order("logged_at", { ascending: false })
      .limit(15),
  ]);

  const competitorNotes = formatCompetitorNotes((competitorLogs ?? []) as CompetitorLogRow[]);
  const instagramTopPosts = (await getBeautyRecentInstagramPosts(12)).filter((p) => p.timestamp >= weekStart);

  const audit = await auditWeeklyBeautyContentPerformance({
    instagramThisWeek: igThisWeek ? { reach: igThisWeek.reach ?? 0, profileViews: igThisWeek.impressions ?? 0, followersCount: igThisWeek.followers_count ?? 0 } : null,
    instagramLastWeek: igLastWeek ? { reach: igLastWeek.reach ?? 0, profileViews: igLastWeek.impressions ?? 0, followersCount: igLastWeek.followers_count ?? 0 } : null,
    instagramTopPosts,
    tiktokThisWeek: ttThisWeek ? { videoViews: ttThisWeek.impressions ?? 0, likes: ttThisWeek.likes ?? 0, followersCount: ttThisWeek.followers_count ?? 0 } : null,
    competitorNotes,
  });

  const { error: upsertError } = await supabase
    .from("loonars_beauty_weekly_content_audits")
    .upsert({ week_start: weekStart, evaluation: audit.narrative, audit: audit as unknown as Json }, { onConflict: "week_start" });
  if (upsertError) throw new Error(`Failed to save beauty weekly content audit: ${upsertError.message}`);

  return { weekStart };
}

/**
 * Beauty's own version of processLeaseholdCompetitorComparison -- our real
 * recent content from Beauty's own Zernio account (0126) vs registered
 * beauty competitors (content_focus='beauty', 0125).
 */
async function processLoonarsBeautyCompetitorComparison(supabase: AdminClient) {
  const [ourPosts, { data: igSnapshot }, { data: competitorLogs }, { data: competitorAccounts }] = await Promise.all([
    getBeautyRecentInstagramPosts(10),
    supabase.from("social_account_snapshots").select("followers_count").eq("platform", "instagram").eq("product_line", "beauty").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id!inner(handle, platform, content_focus)")
      .eq("competitor.content_focus", "beauty")
      .order("logged_at", { ascending: false })
      .limit(15),
    supabase.from("social_competitor_accounts").select("platform, handle").eq("is_active", true).eq("content_focus", "beauty"),
  ]);

  const result = await compareBeautyCompetitorContent({
    ourRecentPosts: ourPosts.map((p) => ({
      caption: p.caption,
      mediaType: p.mediaType,
      reach: p.reach,
      likes: p.likes,
      comments: p.comments,
      shares: p.shares,
      saves: p.saves,
      permalink: p.permalink,
    })),
    ourFollowersCount: igSnapshot?.followers_count ?? 0,
    competitorHandles: (competitorAccounts ?? []).map((c) => ({ platform: c.platform, handle: c.handle })),
    competitorNotes: formatCompetitorNotes((competitorLogs ?? []) as CompetitorLogRow[]),
  });

  const { error: insertError } = await supabase.from("loonars_beauty_competitor_comparisons").insert({
    narrative: result.narrative,
    comparison: result as unknown as Json,
  });
  if (insertError) throw new Error(`Failed to save beauty competitor comparison: ${insertError.message}`);

  return { gapsFound: result.gaps.length };
}

/**
 * Beauty's own version of processMarkomChecklistDraft -- real Zernio
 * performance + the latest competitor comparison's gaps/recommendations
 * feed into 3 concrete content ideas, inserted directly into
 * loonars_content_items (status='idea') for the team to pick up. Closes
 * the same loop property has (competitor determination -> comparison ->
 * checklist), just for beauty.
 */
async function processLoonarsBeautyContentIdeasDraft(supabase: AdminClient) {
  const [ourPosts, { data: igSnapshot }, { data: ttSnapshot }, { data: competitorLogs }, { data: competitorAccounts }, { data: comparison }] = await Promise.all([
    getBeautyRecentInstagramPosts(12),
    supabase.from("social_account_snapshots").select("*").eq("platform", "instagram").eq("product_line", "beauty").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("social_account_snapshots").select("*").eq("platform", "tiktok").eq("product_line", "beauty").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("social_competitor_content_logs")
      .select("hook, caption, hashtags, engagement_notes, content_type, competitor:competitor_account_id!inner(handle, platform, content_focus)")
      .eq("competitor.content_focus", "beauty")
      .order("logged_at", { ascending: false })
      .limit(10),
    supabase.from("social_competitor_accounts").select("platform, handle").eq("is_active", true).eq("content_focus", "beauty"),
    supabase.from("loonars_beauty_competitor_comparisons").select("comparison").order("generated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const comparisonData = comparison?.comparison as { gaps?: string[]; recommendations?: string[] } | null;
  const { bestHour, topContentType } = summarizeBestPostingPattern(ourPosts as unknown as InstagramMediaPerformance[]);

  const items = await researchAndGenerateBeautyContentIdeas({
    instagram: igSnapshot
      ? {
          reach: igSnapshot.reach ?? 0,
          profileViews: igSnapshot.impressions ?? 0,
          followersCount: igSnapshot.followers_count ?? 0,
          bestHour: igSnapshot.best_upload_hour ?? bestHour,
          topContentType: igSnapshot.top_content_type ?? topContentType,
        }
      : null,
    tiktok: ttSnapshot ? { videoViews: ttSnapshot.impressions ?? 0, likes: ttSnapshot.likes ?? 0, followersCount: ttSnapshot.followers_count ?? 0 } : null,
    competitorNotes: formatCompetitorNotes((competitorLogs ?? []) as CompetitorLogRow[]),
    competitorHandles: (competitorAccounts ?? []).map((c) => ({ platform: c.platform, handle: c.handle })),
    competitorComparison: comparisonData ? { gaps: comparisonData.gaps ?? [], recommendations: comparisonData.recommendations ?? [] } : null,
  });

  const { error: insertError } = await supabase.from("loonars_content_items").insert(
    items.map((item) => ({
      title: item.title,
      category: item.category,
      platform: item.platform,
      hook: item.hook || null,
      caption: item.caption || null,
      script_notes: item.scriptNotes || null,
      cta: item.cta || null,
      status: "idea" as const,
    })),
  );
  if (insertError) throw new Error(`Failed to save beauty content ideas: ${insertError.message}`);

  return { ideasCreated: items.length };
}

const LOONARS_RATIO_TARGET = { problem_solution: 40, ugc: 30, edukasi: 20, promosi: 10 } as const;
type LoonarsCategory = keyof typeof LOONARS_RATIO_TARGET;

/**
 * Weekly AI evaluation for the Loonars Beauty module (migration 0107).
 * Ratio/top-performer/retargeting numbers are computed here from real rows
 * (loonars_content_items/metrics/order_snapshots) -- the AI only writes the
 * narrative + recommendation from that pre-computed context, it never
 * invents the numbers. Upserted per week_start, same pattern as
 * processSocialWeeklyEvaluation above.
 */
async function processLoonarsBeautyWeeklyEvaluation(supabase: AdminClient) {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const lastWeekStartDate = new Date(weekStart);
  lastWeekStartDate.setDate(lastWeekStartDate.getDate() - 7);
  const lastWeekStart = lastWeekStartDate.toISOString().slice(0, 10);

  const ratioWindowStart = new Date();
  ratioWindowStart.setDate(ratioWindowStart.getDate() - 30);

  const [{ data: recentContent }, { count: ordersThisWeekCount }, { count: ordersLastWeekCount }] = await Promise.all([
    supabase
      .from("loonars_content_items")
      .select("id, title, category, published_at")
      .eq("status", "published")
      .gte("published_at", ratioWindowStart.toISOString())
      .is("deleted_at", null),
    supabase.from("loonars_orders").select("id", { count: "exact", head: true }).gte("created_at", weekStart).neq("status", "cancelled"),
    supabase
      .from("loonars_orders")
      .select("id", { count: "exact", head: true })
      .gte("created_at", lastWeekStart)
      .lt("created_at", weekStart)
      .neq("status", "cancelled"),
  ]);

  const items = recentContent ?? [];
  const counts: Record<LoonarsCategory, number> = { problem_solution: 0, ugc: 0, edukasi: 0, promosi: 0 };
  for (const item of items) {
    const category = item.category as LoonarsCategory;
    counts[category] = (counts[category] ?? 0) + 1;
  }
  const total = items.length;
  const ratioActual = (Object.keys(counts) as LoonarsCategory[]).reduce(
    (acc, key) => ({ ...acc, [key]: total > 0 ? Math.round((counts[key] / total) * 100) : 0 }),
    {} as Record<LoonarsCategory, number>,
  );

  const publishedThisWeekCount = items.filter((item) => item.published_at && item.published_at.slice(0, 10) >= weekStart).length;
  const contentIds = items.map((item) => item.id);

  let topPerformer: { title: string; views: number; linkClicks: number } | null = null;
  let recommendedBoostContentId: string | null = null;
  const retargetingCandidates: { title: string; views: number }[] = [];

  if (contentIds.length > 0) {
    const { data: metrics } = await supabase
      .from("loonars_content_metrics")
      .select("content_item_id, views, link_clicks, watch_through_50pct")
      .in("content_item_id", contentIds)
      .gte("captured_at", weekStart);

    const byContent = new Map<string, { views: number; linkClicks: number; highRetention: boolean }>();
    for (const metric of metrics ?? []) {
      const agg = byContent.get(metric.content_item_id) ?? { views: 0, linkClicks: 0, highRetention: false };
      agg.views += metric.views ?? 0;
      agg.linkClicks += metric.link_clicks ?? 0;
      agg.highRetention = agg.highRetention || Boolean(metric.watch_through_50pct);
      byContent.set(metric.content_item_id, agg);
    }

    let bestViews = -1;
    for (const item of items) {
      const agg = byContent.get(item.id);
      if (!agg) continue;
      if (agg.views > bestViews) {
        bestViews = agg.views;
        topPerformer = { title: item.title, views: agg.views, linkClicks: agg.linkClicks };
        recommendedBoostContentId = item.id;
      }
      if (agg.highRetention && agg.linkClicks === 0 && agg.views > 0) {
        retargetingCandidates.push({ title: item.title, views: agg.views });
      }
    }
  }

  const ordersThisWeek = ordersThisWeekCount ?? 0;
  const ordersLastWeek = ordersLastWeekCount ?? 0;

  const evaluation = await evaluateLoonarsWeeklyPerformance({
    weekStart,
    contentPublishedCount: publishedThisWeekCount,
    ratioActual,
    ratioTarget: LOONARS_RATIO_TARGET,
    topPerformer,
    retargetingCandidates,
    ordersThisWeek,
    ordersLastWeek,
  });

  const { error: upsertError } = await supabase.from("loonars_weekly_evaluations").upsert(
    { week_start: weekStart, evaluation, content_ratio_actual: ratioActual, recommended_boost_content_id: recommendedBoostContentId },
    { onConflict: "week_start" },
  );
  if (upsertError) throw new Error(`Failed to save Loonars Beauty weekly evaluation: ${upsertError.message}`);

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
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;
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
                : job.job_type === "loonars_beauty_weekly_evaluation"
                  ? await processLoonarsBeautyWeeklyEvaluation(supabase)
                  : job.job_type === "knowledge_bank_refresh"
                    ? await processKnowledgeBankRefresh(job)
                    : job.job_type === "sales_closing_tips_broadcast"
                      ? await processSalesClosingTipsBroadcast(job)
                      : job.job_type === "leasehold_competitor_comparison"
                        ? await processLeaseholdCompetitorComparison(supabase)
                        : job.job_type === "competitor_discovery"
                          ? await processCompetitorDiscovery(supabase, job)
                          : job.job_type === "loonars_beauty_competitor_comparison"
                            ? await processLoonarsBeautyCompetitorComparison(supabase)
                            : job.job_type === "loonars_beauty_content_ideas_draft"
                              ? await processLoonarsBeautyContentIdeasDraft(supabase)
                              : job.job_type === "loonars_beauty_weekly_content_audit"
                                ? await processLoonarsBeautyWeeklyContentAudit(supabase)
                                : job.job_type === "investor_intelligence_refresh"
                                ? await processInvestorIntelligenceRefresh(job)
                                : job.job_type === "cashflow_intelligence_refresh"
                                  ? await processCashflowIntelligenceRefresh(job)
                                  : job.job_type === "sales_teaching_weekly"
                                    ? await processSalesTeachingWeekly(supabase, job)
                                    : job.job_type === "cashflow_action_plan"
                                      ? await processCashflowActionPlan(supabase, job)
                                      : job.job_type === "markom_content_performance_broadcast"
                                        ? await processMarkomContentPerformanceBroadcast(supabase)
                                        : job.job_type === "occupancy_intelligence_refresh"
                                          ? await processOccupancyIntelligenceRefresh(job)
                                          : job.job_type === "occupancy_teaching_biweekly"
                                            ? await processOccupancyTeachingBiweekly(supabase, job)
                                            : job.job_type === "content_submission_review"
                                              ? await processContentSubmissionReview(supabase, job)
                                              : job.job_type === "kontenai_auto_produce"
                                                ? await processKontenAiAutoProduce(supabase, job)
                                                : job.job_type === "kontenai_auto_produce_beauty"
                                                ? await processKontenAiAutoProduceBeauty(supabase, job)
                                                : job.job_type === "kontenai_auto_bridge_to_studio"
                                                  ? await processKontenAiAutoBridgeToStudio(supabase, job)
                                                  : job.job_type === "zernio_publish_reconcile"
                                                    ? await processZernioPublishReconcile(supabase, job)
                                                    : job.job_type === "friday_executive_briefing"
                                                      ? await processFridayExecutiveBriefing(job.payload as unknown as FridayBriefingJobPayload, job.id)
                                                      : job.job_type === "friday_holding_briefing"
                                                        ? await processFridayHoldingBriefing(job.payload as unknown as FridayHoldingBriefingJobPayload, job.id)
                                                        : job.job_type === "social_weekly_evaluation"
                                                          ? await processSocialWeeklyEvaluation(supabase)
                                                          : job.job_type === "whatsapp_lead_nurture_reply"
                                                            ? await processLeadNurtureReply(job)
                                                            : job.job_type === "whatsapp_admin_answer_relay"
                                                              ? await processAdminAnswerRelay(job)
                                                              : job.job_type === "social_monthly_content_report"
                                                                ? await processSocialMonthlyContentReport(supabase)
                                                                : job.job_type === "markom_hashtag_bank_refresh"
                                                                  ? await processMarkomHashtagBankRefresh(supabase, job)
                                                                  : unknownJobType(job.job_type);
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

    // A lead waiting on the nurture bot must never be left hanging either,
    // same reasoning as whatsapp_ai_reply above -- send the fallback
    // directly rather than trying to fake a knowledge-base answer.
    if (job.job_type === "whatsapp_lead_nurture_reply") {
      const payload = job.payload as unknown as WhatsAppLeadNurtureReplyJobPayload;
      const sendResult = await sendWhatsAppText(payload.sender, AI_BUSY_FALLBACK_MESSAGE);

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
