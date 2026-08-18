import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export interface WhatsAppAiReplyJobPayload {
  sender: string;
  contentText: string;
  employeeId: string | null;
  employeeName: string | null;
}

export interface WhatsAppLeadNurtureReplyJobPayload {
  sender: string;
  senderName: string | null;
  contentText: string;
  /** Present only when this message carried a real ad_reply referral (see connectors/types.ts's AdReferral). */
  adReferralSourceId: string | null;
  /** Present only when the lead's ad_reply was empty (e.g. Whacenter sent nulls despite WhatsApp showing "started from an ad") and they were asked which project they meant -- see tryHandleUnmatchedAdLead / pending_project_selections. Takes priority over adReferralSourceId when both would somehow be set. */
  resolvedProjectId?: string | null;
}

export interface WhatsAppAdminAnswerRelayJobPayload {
  pendingQuestionId: string;
}

/**
 * The async durable queue (ai_job_queue) — enqueueing here, instead of
 * calling Gemini directly from the webhook handler, is what makes the
 * WhatsApp reply pipeline survive a Vercel function timeout: the insert
 * trigger (ai_job_queue_after_insert, migration 0065) dispatches the job to
 * app/api/ai/process-job immediately for the common case, and the
 * ai-job-dispatch-pending pg_cron sweep is the safety net for anything that
 * dispatch missed or that's waiting out a backoff window
 * (next_attempt_at) — never an in-process sleep inside one invocation.
 */
export async function enqueueWhatsAppAiReplyJob(payload: WhatsAppAiReplyJobPayload, maxAttempts: number): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: "whatsapp_ai_reply", payload: payload as never, max_attempts: maxAttempts })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("enqueueWhatsAppAiReplyJob failed", { error: error?.message });
    return null;
  }
  return { id: data.id };
}

/** Queues one turn of the ad-lead nurture bot (lib/ai/domains/lead-nurture.ts) -- same "survive a Vercel timeout" reasoning as enqueueWhatsAppAiReplyJob above. */
export async function enqueueLeadNurtureReplyJob(payload: WhatsAppLeadNurtureReplyJobPayload, maxAttempts: number): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: "whatsapp_lead_nurture_reply", payload: payload as never, max_attempts: maxAttempts })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("enqueueLeadNurtureReplyJob failed", { error: error?.message });
    return null;
  }
  return { id: data.id };
}

/** Queues the Gemini-rephrase-and-send-to-lead half of a Super Admin's "[PQ-0001]: jawaban" reply (the DB writes happen synchronously in the webhook, see tryHandleSuperadminAnswer). */
export async function enqueueAdminAnswerRelayJob(payload: WhatsAppAdminAnswerRelayJobPayload, maxAttempts: number): Promise<{ id: string } | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("ai_job_queue")
    .insert({ job_type: "whatsapp_admin_answer_relay", payload: payload as never, max_attempts: maxAttempts })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("enqueueAdminAnswerRelayJob failed", { error: error?.message });
    return null;
  }
  return { id: data.id };
}
