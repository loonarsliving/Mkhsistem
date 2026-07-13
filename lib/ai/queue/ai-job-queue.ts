import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export interface WhatsAppAiReplyJobPayload {
  sender: string;
  contentText: string;
  employeeId: string | null;
  employeeName: string | null;
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
