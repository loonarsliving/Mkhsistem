import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { sendWhatsAppText } from "../notifications/engine";

/**
 * WhatsApp ad leads answered from Loonars Connect (0303), inbound side.
 *
 * For a branch in a lead department's scope (Jogja), a customer who clicked
 * the Meta ad is handed to the next sales person in turn and the whole
 * conversation lives in that person's Chat; follow-up messages from the same
 * number join it. The database decides scope, rotation and storage
 * (mkc_wa_lead_inbound); this module only sends the one-time greeting.
 *
 * Checked in webhook-handler.ts right after the refund chat, before the villa
 * receptionist and every AI / nurture route, so a captured lead never gets a
 * bot reply. Never throws: anything unexpected returns "not_applicable" and
 * the existing flow continues as before.
 */

export type WaLeadInboundContent =
  | { kind: "text"; text: string }
  | { kind: "image"; url: string; caption?: string }
  | { kind: "raw"; text: string };

export type WaLeadCaptureResult = { outcome: "captured"; leadId: string; conversationId: string; isNew: boolean } | { outcome: "not_applicable" };

interface InboundRpcResult {
  handled: boolean;
  lead_id?: string;
  conversation_id?: string;
  is_new?: boolean;
  greeting?: string | null;
}

async function capture(
  sender: string,
  senderName: string | undefined,
  content: WaLeadInboundContent,
  scope: { adSourceId?: string | null; projectId?: string | null },
): Promise<WaLeadCaptureResult> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("mkc_wa_lead_inbound", {
    p_phone: sender,
    p_name: senderName ?? null,
    p_body: content.kind === "image" ? (content.caption ?? "") : content.text,
    p_media_url: content.kind === "image" ? content.url : null,
    p_ad_source_id: scope.adSourceId ?? null,
    p_project_id: scope.projectId ?? null,
  });
  if (error) {
    logger.warn("wa-lead: inbound capture failed, falling back to the existing flow", { error: error.message });
    return { outcome: "not_applicable" };
  }
  const r = (data ?? { handled: false }) as unknown as InboundRpcResult;
  if (!r.handled || !r.lead_id || !r.conversation_id) return { outcome: "not_applicable" };

  if (r.is_new && r.greeting) {
    const sent = await sendWhatsAppText(sender, r.greeting);
    if (!sent.success) logger.warn("wa-lead: greeting not delivered", { leadId: r.lead_id, error: sent.error });
    const { error: recordError } = await supabase.rpc("mkc_wa_lead_record_system_out", {
      p_lead_id: r.lead_id,
      p_body: r.greeting,
      p_ok: sent.success,
      p_error: sent.success ? null : (sent.error ?? "unknown error"),
    });
    if (recordError) logger.warn("wa-lead: greeting not recorded", { leadId: r.lead_id, error: recordError.message });
  }
  return { outcome: "captured", leadId: r.lead_id, conversationId: r.conversation_id, isNew: !!r.is_new };
}

/** A WhatsApp message: joins the sender's open lead, or opens one when it carries an ad of a branch in scope. */
export async function tryCaptureWaLeadMessage(
  sender: string,
  senderName: string | undefined,
  content: WaLeadInboundContent,
  adSourceId: string | null | undefined,
): Promise<WaLeadCaptureResult> {
  try {
    return await capture(sender, senderName, content, { adSourceId });
  } catch (err) {
    logger.warn("wa-lead: capture threw, falling back to the existing flow", { error: err instanceof Error ? err.message : String(err) });
    return { outcome: "not_applicable" };
  }
}

/** An ad click whose ad data was missing, after the customer named the project (lead-nurture's project selection). */
export async function tryCaptureWaLeadForProject(
  sender: string,
  senderName: string | undefined,
  text: string,
  projectId: string,
): Promise<WaLeadCaptureResult> {
  try {
    return await capture(sender, senderName, { kind: "text", text }, { projectId });
  } catch (err) {
    logger.warn("wa-lead: project capture threw, falling back to nurture", { error: err instanceof Error ? err.message : String(err) });
    return { outcome: "not_applicable" };
  }
}
