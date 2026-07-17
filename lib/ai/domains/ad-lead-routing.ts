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
