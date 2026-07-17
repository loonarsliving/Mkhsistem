import "server-only";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import type { AdReferral } from "../connectors/types";
import { sendWhatsAppText } from "../notifications/engine";

export type AdLeadRoutingOutcome =
  | "ad_not_matched"
  | "no_sales_available"
  | "insert_failed"
  | "new_prospect_routed"
  | "existing_prospect_notified";

export interface AdLeadRoutingResult {
  outcome: AdLeadRoutingOutcome;
  prospectId?: string;
}

const PROJECT_TYPE_HOUSE_TYPE_LABEL: Record<string, string> = {
  villa: "Villa",
  subsidized: "Rumah Subsidi",
  commercial: "Komersial",
  land: "Tanah Kavling",
};

/** Mirrors prospects.phone_normalized's generated-column logic (regexp_replace(phone, '[^0-9]', '', 'g')) so the lookup matches the same way the DB itself dedupes. */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * The core of "iklan diklik -> masuk sistem -> dibagi rata ke sales" --
 * called from handleWhatsAppWebhookEvent whenever an inbound WhatsApp
 * message carries a real ad_reply (see whatsapp-connector.ts's
 * normalizeIncomingMessage). Deliberately does NOT reply to the lead itself
 * -- the operator already runs their own auto-reply on that WhatsApp number;
 * this only needs to get the lead into the system and into a sales rep's
 * hands, via a WhatsApp notification through the same Whacenter connector.
 */
export async function routeAdDrivenLead(sender: string, senderName: string | undefined, adReferral: AdReferral): Promise<AdLeadRoutingResult> {
  const supabase = createAdminClient();

  const { data: campaign } = await supabase
    .from("meta_ad_campaigns")
    .select("id, name, headline, project_id, branch_id, project:project_id(name, city, project_type)")
    .or(`meta_ad_id.eq.${adReferral.sourceId},meta_adset_id.eq.${adReferral.sourceId},meta_creative_id.eq.${adReferral.sourceId}`)
    .limit(1)
    .maybeSingle();

  if (!campaign) {
    logger.info("routeAdDrivenLead: ad not matched to a known campaign", { sourceId: adReferral.sourceId, sender });
    return { outcome: "ad_not_matched" };
  }

  const project = campaign.project as { name?: string; city?: string; project_type?: string } | null;
  const senderDigits = digitsOnly(sender);

  const { data: existing } = await supabase
    .from("prospects")
    .select("id, sales_id")
    .eq("phone_normalized", senderDigits)
    .is("deleted_at", null)
    .maybeSingle();

  let prospectId: string;
  let salesId: string;
  let outcome: AdLeadRoutingOutcome;

  if (existing) {
    prospectId = existing.id;
    salesId = existing.sales_id;
    outcome = "existing_prospect_notified";
  } else {
    const { data: pickedSalesId } = await supabase.rpc("crm_pick_round_robin_sales", { p_branch_id: campaign.branch_id });
    if (!pickedSalesId) {
      logger.info("routeAdDrivenLead: no active sales in branch", { branchId: campaign.branch_id });
      return { outcome: "no_sales_available" };
    }

    const { data: inserted, error } = await supabase
      .from("prospects")
      .insert({
        customer_name: senderName || "Lead dari Iklan",
        phone: sender,
        project_id: campaign.project_id,
        house_type: (project?.project_type && PROJECT_TYPE_HOUSE_TYPE_LABEL[project.project_type]) || "Belum diketahui",
        city: project?.city || "-",
        lead_source: "facebook_ads",
        notes: `Lead otomatis dari klik iklan "${campaign.headline || campaign.name}".`,
        sales_id: pickedSalesId as string,
        branch_id: campaign.branch_id,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      logger.error("routeAdDrivenLead: prospect insert failed", { error: error?.message, sender });
      return { outcome: "insert_failed" };
    }

    prospectId = inserted.id;
    salesId = pickedSalesId as string;
    outcome = "new_prospect_routed";
  }

  const { data: salesEmployee } = await supabase.from("employees").select("full_name, phone").eq("id", salesId).maybeSingle();

  if (salesEmployee?.phone) {
    const projectLabel = project?.name ? ` (${project.name})` : "";
    const adSourceLabel = campaign.headline || campaign.name || "-";
    const enteredAtLabel = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
    const notifyText =
      outcome === "new_prospect_routed"
        ? `Lead baru dari iklan${projectLabel}!\nNama: ${senderName || "Tidak diketahui"}\nWA: ${sender}\nSumber iklan: ${adSourceLabel}\nWaktu masuk: ${enteredAtLabel}\nSegera hubungi sebelum lead ini dingin.`
        : `Lead lama klik iklan lagi${projectLabel} -- tanda minat masih ada.\nNama: ${senderName || "Tidak diketahui"}\nWA: ${sender}\nSumber iklan: ${adSourceLabel}\nWaktu masuk: ${enteredAtLabel}\nSegera follow up.`;
    const sendResult = await sendWhatsAppText(salesEmployee.phone, notifyText);
    if (!sendResult.success) {
      logger.error("routeAdDrivenLead: WA notify to sales failed", { salesId, error: sendResult.error });
    }
  } else {
    logger.error("routeAdDrivenLead: assigned sales has no phone on file", { salesId });
  }

  await supabase.from("mkc_notifications").insert({
    user_id: salesId,
    type: "crm",
    category: "new_ad_lead",
    title: outcome === "new_prospect_routed" ? "Lead baru dari iklan" : "Lead lama klik iklan lagi",
    body: `${senderName || "Lead"} (${sender}) klik iklan${project?.name ? ` ${project.name}` : ""} -- segera follow up.`,
    link: `/crm/${prospectId}`,
  });

  return { outcome, prospectId };
}

export type AdLeadFollowUpConfirmOutcome = "not_a_confirm_command" | "confirmed" | "not_found" | "ambiguous";

export interface AdLeadFollowUpConfirmResult {
  outcome: AdLeadFollowUpConfirmOutcome;
  customerName?: string;
}

/**
 * Lets a Sales rep clear the hourly "belum di-follow up" reminder
 * (0104_ad_lead_followup_monitoring.sql) just by mentioning the last few
 * digits of the customer's phone number anywhere in a reply -- "sudah
 * 9827", "9827 udah dihubungi", or plain "9827" all work. Deliberately not
 * a strict "SUDAH <code>" command: real people don't type exact syntax
 * (a first version requiring that exact format with a space produced
 * "SUDAH9827" with no space, which nothing matched, and the Sales rep gave
 * up and used Menu Prospek manually instead). Only ever matches against
 * prospects already assigned to the replying sales_id with no logged
 * follow-up yet, so there's no way to mark someone else's lead (or an
 * already-resolved one) via a guessed number, and nothing pending at all
 * means this doesn't intercept the message -- it falls through to the
 * normal AI reply instead of hijacking an unrelated chat. Mirrors
 * crm_add_follow_up's exact effect (prospect_follow_ups insert +
 * last_follow_up_at + status bump) since that RPC requires an
 * authenticated auth.uid() session this server-to-server webhook doesn't
 * have.
 */
export async function tryConfirmAdLeadFollowUp(salesId: string, messageText: string): Promise<AdLeadFollowUpConfirmResult> {
  const digitRuns = messageText.match(/\d{3,}/g);
  if (!digitRuns || digitRuns.length === 0) return { outcome: "not_a_confirm_command" };

  const supabase = createAdminClient();
  const { data: candidates } = await supabase
    .from("prospects")
    .select("id, customer_name, phone_normalized, status")
    .eq("sales_id", salesId)
    .eq("lead_source", "facebook_ads")
    .is("deleted_at", null)
    .is("last_follow_up_at", null)
    .not("status", "in", "(closing,inactive)");

  if (!candidates || candidates.length === 0) return { outcome: "not_a_confirm_command" };

  const matches = candidates.filter((p) => digitRuns.some((run) => (p.phone_normalized ?? "").endsWith(run)));
  if (matches.length === 0) return { outcome: "not_found" };
  if (matches.length > 1) return { outcome: "ambiguous" };

  const prospect = matches[0];
  const now = new Date();

  await supabase.from("prospect_follow_ups").insert({
    prospect_id: prospect.id,
    activity_type: "whatsapp",
    activity_date: now.toISOString().slice(0, 10),
    activity_time: now.toTimeString().slice(0, 8),
    notes: "Follow up dikonfirmasi otomatis via balasan WhatsApp ke reminder AI Lead Dispatcher.",
    created_by: salesId,
  });

  await supabase
    .from("prospects")
    .update({
      last_follow_up_at: now.toISOString(),
      status: prospect.status === "red" || prospect.status === "inactive" ? "yellow" : prospect.status,
      updated_by: salesId,
    })
    .eq("id", prospect.id);

  return { outcome: "confirmed", customerName: prospect.customer_name };
}
