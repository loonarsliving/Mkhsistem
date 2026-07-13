import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { AI_CONFIG } from "@/lib/ai/config";
import { routeAndAnswer } from "@/lib/ai/domains/router";
import { sendWhatsAppText } from "@/lib/ai/notifications/engine";
import { AIProviderError } from "@/lib/ai/provider/errors";
import { computeBackoffMs } from "@/lib/ai/provider/gemini-retry";
import type { WhatsAppAiReplyJobPayload } from "@/lib/ai/queue/ai-job-queue";
import { AI_BUSY_FALLBACK_MESSAGE, saveAiConversationTurn } from "@/lib/ai/webhook-handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Dispatched by ai_job_queue_after_insert (immediate, on enqueue) and
 * ai_job_dispatch_pending (pg_cron sweep every 1 minute, migration 0065).
 *
 * Does exactly ONE Gemini attempt per invocation (routeAndAnswer's
 * maxAttempts: 1) — the backoff between attempts is expressed as
 * next_attempt_at (a future dispatch, picked up by the next cron sweep),
 * never an in-process sleep. That's the actual fix for the risk flagged
 * earlier in this project: a 20s/40s/80s in-process backoff sequence can
 * exceed a Vercel serverless function's duration limit and silently drop
 * the reply even with otherwise-correct retry code. This route can never
 * block long enough to hit that limit, no matter how many attempts a job
 * eventually needs — each invocation does one attempt and returns.
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

  const payload = job.payload as unknown as WhatsAppAiReplyJobPayload;

  try {
    const replyText = await routeAndAnswer(
      payload.contentText,
      payload.employeeId !== null && payload.employeeName !== null ? { id: payload.employeeId, name: payload.employeeName } : null,
      { maxAttempts: 1, jobId: job.id },
    );

    const sendResult = await sendWhatsAppText(payload.sender, replyText);
    await saveAiConversationTurn(payload.sender, payload.contentText, replyText, payload.employeeId);
    await supabase.from("ai_job_queue").update({ status: "succeeded", updated_at: new Date().toISOString() }).eq("id", job.id);

    logger.info("ai job succeeded", { jobId: job.id, attempt: job.attempt_count + 1, replySent: sendResult.success });
    return NextResponse.json({ status: "succeeded", replySent: sendResult.success });
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

      logger.info("ai job rescheduled", { jobId: job.id, attemptCount, maxAttempts: job.max_attempts, waitMs, error: errorMessage });
      return NextResponse.json({ status: "rescheduled", attemptCount, waitMs });
    }

    // Every attempt is used up, or the failure is non-retryable (e.g.
    // model not found) -- never leave the user without a reply. Send the
    // friendly fallback now instead of silently dead-lettering with no
    // WhatsApp message ever arriving. Never expose errorMessage/stack here.
    logger.error("ai job exhausted -- sending fallback reply", { jobId: job.id, attemptCount, retryable, error: errorMessage });
    const sendResult = await sendWhatsAppText(payload.sender, AI_BUSY_FALLBACK_MESSAGE);
    await saveAiConversationTurn(payload.sender, payload.contentText, AI_BUSY_FALLBACK_MESSAGE, payload.employeeId);

    await supabase
      .from("ai_job_queue")
      .update({ status: "dead_letter", attempt_count: attemptCount, last_error: errorMessage, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    return NextResponse.json({ status: "dead_letter", replySent: sendResult.success });
  }
}
