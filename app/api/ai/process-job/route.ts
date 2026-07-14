import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_CONFIG } from "@/lib/ai/config";
import { draftSp1Warning } from "@/lib/ai/domains/crm";
import { researchAndGenerateChecklist } from "@/lib/ai/domains/markom";
import { routeAndAnswer } from "@/lib/ai/domains/router";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { AIProviderError } from "@/lib/ai/provider/errors";
import { computeBackoffMs } from "@/lib/ai/provider/gemini-retry";
import type { WhatsAppAiReplyJobPayload } from "@/lib/ai/queue/ai-job-queue";
import { AI_BUSY_FALLBACK_MESSAGE, saveAiConversationTurn } from "@/lib/ai/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CrmSp1DraftJobPayload {
  sp1_warning_id: string;
}

interface MarkomChecklistDraftJobPayload {
  branch_id: string;
  branch_name: string;
  division_id: string;
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

/** Clamped 1-5 week-of-month, matching kpi_tasks.period_week's own convention (see AssignChecklistForm). */
function currentPeriodWeek(date: Date): number {
  return Math.min(5, Math.ceil(date.getDate() / 7));
}

/** One Gemini attempt to research + draft exactly 3 Markom checklist items, then inserts them directly (no human approval gate -- matches kpi_assign_tasks' existing behavior when a Branch Manager creates a checklist by hand) and notifies the team, same category/notification shape kpi_assign_tasks already uses. */
async function processMarkomChecklistDraft(supabase: AdminClient, job: JobRow) {
  const payload = job.payload as unknown as MarkomChecklistDraftJobPayload;
  const items = await researchAndGenerateChecklist(payload.branch_name);

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
          : await processMarkomChecklistDraft(supabase, job);
    await supabase.from("ai_job_queue").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", job.id);

    logger.info("ai job succeeded", { jobId: job.id, jobType: job.job_type, attempt: job.attempt_count + 1, result });
    return NextResponse.json({ status: "succeeded", result });
  } catch (err) {
    const attemptCount = job.attempt_count + 1;
    const retryable = err instanceof AIProviderError ? err.retryable : true;
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
    // not found). whatsapp_ai_reply must never leave the user without a
    // reply -- send the friendly fallback now instead of silently
    // dead-lettering with no WhatsApp message ever arriving. crm_sp1_draft
    // and markom_checklist_draft have no chat counterpart waiting on a
    // reply, so they just dead-letter: crm_sp1_draft's warning row already
    // exists (unique sales_id/period_month/period_year), so nothing
    // re-enqueues it automatically; markom_checklist_draft simply skips
    // that team's checklist for this cycle -- the next 3-day dispatch tries
    // again fresh. An operator can re-trigger either manually if needed.
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
