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
  | "existing_prospect_notified"
  | "freelance_new_lead_routed"
  | "freelance_existing_lead_notified";

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
  const projectLabel = project?.name ? ` (${project.name})` : "";
  const adSourceLabel = campaign.headline || campaign.name || "-";
  // No explicit timeZone meant this rendered in the server's runtime zone
  // (UTC on Vercel) instead of Indonesia local time -- a lead that came in
  // at, say, 14:00 WITA showed up in the WhatsApp notification as "06:00",
  // 7-8 hours off depending on region. WITA (Asia/Makassar, UTC+8) matches
  // the reference zone the rest of the codebase already uses for
  // company-wide scheduling (see app/api/crm/dispatch-promo-sends/route.ts's
  // witaHour), not a per-branch WIB/WITA split.
  const enteredAtLabel = new Date().toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" });

  const { data: existing } = await supabase
    .from("prospects")
    .select("id, sales_id")
    .eq("phone_normalized", senderDigits)
    .is("deleted_at", null)
    .maybeSingle();

  if (existing) {
    const salesId = existing.sales_id;
    const { data: salesEmployee } = await supabase.from("employees").select("phone").eq("id", salesId).maybeSingle();
    if (salesEmployee?.phone) {
      const notifyText = `Lead lama klik iklan lagi${projectLabel} -- tanda minat masih ada.\nNama: ${senderName || "Tidak diketahui"}\nWA: ${sender}\nSumber iklan: ${adSourceLabel}\nWaktu masuk: ${enteredAtLabel}\nSegera follow up.`;
      const sendResult = await sendWhatsAppText(salesEmployee.phone, notifyText);
      if (!sendResult.success) logger.error("routeAdDrivenLead: WA notify to sales failed", { salesId, error: sendResult.error });
    } else {
      logger.error("routeAdDrivenLead: assigned sales has no phone on file", { salesId });
    }

    await supabase.from("mkc_notifications").insert({
      user_id: salesId,
      type: "crm",
      category: "new_ad_lead",
      title: "Lead lama klik iklan lagi",
      body: `${senderName || "Lead"} (${sender}) klik iklan${project?.name ? ` ${project.name}` : ""} -- segera follow up.`,
      link: `/crm/${existing.id}`,
    });

    return { outcome: "existing_prospect_notified", prospectId: existing.id };
  }

  // A repeat click from a lead already delivered to a freelancer (0136) --
  // re-notify the SAME freelancer instead of running the fairness pick
  // again, mirroring the internal "existing prospect" branch above. No
  // prospects row exists for these (freelancers never touch the CRM), so
  // this can't be caught by the lookup above.
  const { data: priorDelivery } = await supabase
    .from("freelance_lead_deliveries")
    .select("recipient_id, freelance_lead_recipients(full_name, phone)")
    .eq("phone_normalized", senderDigits)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (priorDelivery) {
    const recipient = priorDelivery.freelance_lead_recipients as unknown as { full_name: string; phone: string } | null;
    if (recipient?.phone) {
      const notifyText = `Lead lama klik iklan lagi${projectLabel} -- tanda minat masih ada.\nNama: ${senderName || "Tidak diketahui"}\nWA: ${sender}\nSumber iklan: ${adSourceLabel}\nWaktu masuk: ${enteredAtLabel}\nSegera follow up.`;
      const sendResult = await sendWhatsAppText(recipient.phone, notifyText);
      if (!sendResult.success) logger.error("routeAdDrivenLead: WA notify to freelance failed", { recipientId: priorDelivery.recipient_id, error: sendResult.error });
    }
    return { outcome: "freelance_existing_lead_notified" };
  }

  const { data: picked } = await supabase
    .rpc("crm_pick_round_robin_sales_or_freelance", { p_branch_id: campaign.branch_id, p_project_id: campaign.project_id })
    .maybeSingle();

  if (!picked) {
    logger.info("routeAdDrivenLead: no active sales or freelance recipient in branch", { branchId: campaign.branch_id });
    return { outcome: "no_sales_available" };
  }

  if (picked.recipient_type === "freelance") {
    if (picked.phone) {
      const notifyText = `Lead baru${projectLabel}!\nNama: ${senderName || "Tidak diketahui"}\nWA: ${sender}\nSumber iklan: ${adSourceLabel}\nWaktu masuk: ${enteredAtLabel}\nSegera hubungi sebelum lead ini dingin.`;
      const sendResult = await sendWhatsAppText(picked.phone, notifyText);
      if (!sendResult.success) logger.error("routeAdDrivenLead: WA notify to freelance failed", { recipientId: picked.recipient_id, error: sendResult.error });
    } else {
      logger.error("routeAdDrivenLead: picked freelance recipient has no phone on file", { recipientId: picked.recipient_id });
    }

    await supabase.from("freelance_lead_deliveries").insert({
      recipient_id: picked.recipient_id,
      customer_name: senderName || "Lead dari Iklan",
      phone: sender,
      campaign_id: campaign.id,
    });
    await supabase.from("freelance_lead_recipients").update({ last_lead_sent_at: new Date().toISOString() }).eq("id", picked.recipient_id);

    return { outcome: "freelance_new_lead_routed" };
  }

  const salesId = picked.recipient_id;

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
      sales_id: salesId,
      branch_id: campaign.branch_id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    logger.error("routeAdDrivenLead: prospect insert failed", { error: error?.message, sender });
    return { outcome: "insert_failed" };
  }

  const prospectId = inserted.id;

  if (picked.phone) {
    const notifyText = `Lead baru dari iklan${projectLabel}!\nNama: ${senderName || "Tidak diketahui"}\nWA: ${sender}\nSumber iklan: ${adSourceLabel}\nWaktu masuk: ${enteredAtLabel}\nSegera hubungi sebelum lead ini dingin.`;
    const sendResult = await sendWhatsAppText(picked.phone, notifyText);
    if (!sendResult.success) logger.error("routeAdDrivenLead: WA notify to sales failed", { salesId, error: sendResult.error });
  } else {
    logger.error("routeAdDrivenLead: assigned sales has no phone on file", { salesId });
  }

  await supabase.from("mkc_notifications").insert({
    user_id: salesId,
    type: "crm",
    category: "new_ad_lead",
    title: "Lead baru dari iklan",
    body: `${senderName || "Lead"} (${sender}) klik iklan${project?.name ? ` ${project.name}` : ""} -- segera follow up.`,
    link: `/crm/${prospectId}`,
  });

  return { outcome: "new_prospect_routed", prospectId };
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

export type AdLeadReassignOutcome =
  | "not_a_reassign_command"
  | "reassigned"
  | "not_found"
  | "ambiguous"
  | "no_other_sales";

export interface AdLeadReassignResult {
  outcome: AdLeadReassignOutcome;
  customerName?: string;
  previousSalesName?: string;
  newSalesName?: string;
}

/** Requires an explicit keyword (unlike tryConfirmAdLeadFollowUp) since this reassigns lead ownership, not just logs a follow-up -- a stray digit run in an unrelated Kepala Cabang message must never accidentally move a lead. */
const REASSIGN_KEYWORD_PATTERN = /\b(lempar|oper|alihkan)\b/i;

/**
 * Lets a Kepala Cabang reassign a lead that's been escalated to them (3x
 * reminded, still not followed up -- see crm_run_ad_lead_monitoring) to
 * another Sales in their branch, just by replying "LEMPAR <4 digit
 * terakhir nomor>" (or "oper"/"alihkan") on WhatsApp -- see the exact
 * instruction sent in the branch-escalation notification
 * (0110_ad_lead_3x_daily_reminder_and_reassign.sql). Only ever matches
 * against leads in the Kepala Cabang's own branch that are still pending
 * (mirrors tryConfirmAdLeadFollowUp's safety scoping), and only fires when
 * both the keyword and a digit run are present so it never hijacks an
 * unrelated message.
 */
export async function tryReassignAdLeadFollowUp(
  kepalaCabangId: string,
  branchId: string,
  messageText: string,
): Promise<AdLeadReassignResult> {
  if (!REASSIGN_KEYWORD_PATTERN.test(messageText)) return { outcome: "not_a_reassign_command" };

  const digitRuns = messageText.match(/\d{3,}/g);
  if (!digitRuns || digitRuns.length === 0) return { outcome: "not_a_reassign_command" };

  const supabase = createAdminClient();
  const { data: candidates } = await supabase
    .from("prospects")
    .select("id, customer_name, phone, phone_normalized, sales_id, status")
    .eq("branch_id", branchId)
    .eq("lead_source", "facebook_ads")
    .is("created_by", null)
    .is("deleted_at", null)
    .is("last_follow_up_at", null)
    .not("status", "in", "(closing,inactive)");

  if (!candidates || candidates.length === 0) return { outcome: "not_a_reassign_command" };

  const matches = candidates.filter((p) => digitRuns.some((run) => (p.phone_normalized ?? "").endsWith(run)));
  if (matches.length === 0) return { outcome: "not_found" };
  if (matches.length > 1) return { outcome: "ambiguous" };

  const prospect = matches[0];
  const previousSalesId = prospect.sales_id;

  const { data: newSalesId } = await supabase.rpc("crm_pick_round_robin_sales_excluding", {
    p_branch_id: branchId,
    p_exclude_sales_id: previousSalesId,
  });
  if (!newSalesId) return { outcome: "no_other_sales" };

  const [{ data: previousSales }, { data: newSales }] = await Promise.all([
    supabase.from("employees").select("full_name, phone").eq("id", previousSalesId).maybeSingle(),
    supabase.from("employees").select("full_name, phone").eq("id", newSalesId as string).maybeSingle(),
  ]);

  await supabase
    .from("prospects")
    .update({ sales_id: newSalesId as string, last_reminder_sent_at: null, updated_by: kepalaCabangId })
    .eq("id", prospect.id);

  if (newSales?.phone) {
    const notifyText = `Lead dialihkan dari Sales lain oleh Kepala Cabang.\nNama: ${prospect.customer_name ?? "Tidak diketahui"}\nWA: ${prospect.phone ?? "-"}\nSegera follow up.`;
    const sendResult = await sendWhatsAppText(newSales.phone, notifyText);
    if (!sendResult.success) {
      logger.error("tryReassignAdLeadFollowUp: WA notify to new sales failed", { newSalesId, error: sendResult.error });
    }
  }
  if (previousSales?.phone) {
    const notifyText = `Lead ${prospect.customer_name ?? "-"} sudah dialihkan ke Sales lain oleh Kepala Cabang karena belum sempat di-follow up. Reminder untuk lead ini berhenti.`;
    const sendResult = await sendWhatsAppText(previousSales.phone, notifyText);
    if (!sendResult.success) {
      logger.error("tryReassignAdLeadFollowUp: WA notify to previous sales failed", { previousSalesId, error: sendResult.error });
    }
  }

  await supabase.from("mkc_notifications").insert({
    user_id: newSalesId as string,
    type: "crm",
    category: "new_ad_lead",
    title: "Lead dialihkan dari Sales lain",
    body: `${prospect.customer_name ?? "Lead"} dialihkan ke Anda oleh Kepala Cabang -- segera follow up.`,
    link: `/crm/${prospect.id}`,
  });

  return {
    outcome: "reassigned",
    customerName: prospect.customer_name ?? undefined,
    previousSalesName: previousSales?.full_name ?? undefined,
    newSalesName: newSales?.full_name ?? undefined,
  };
}

export type AdLeadBulkReassignOutcome = "not_a_bulk_reassign_command" | "reassigned" | "sales_not_found" | "sales_ambiguous" | "no_leads_to_reassign" | "no_other_sales";

export interface AdLeadBulkReassignResult {
  outcome: AdLeadBulkReassignOutcome;
  sourceSalesName?: string;
  candidateNames?: string[];
  reassignedCount?: number;
}

const BULK_REASSIGN_PATTERN = /\blempar\s+semua\s+(.+)/i;

/**
 * Lets a Kepala Cabang reassign EVERY currently-unfollowed ad lead belonging
 * to one named sales rep in their branch at once, by replying "LEMPAR SEMUA
 * <nama sales>" -- the exact instruction sent by
 * crm_run_sales_conduct_monitoring (0120) when a sales rep has 5+ leads
 * sitting completely unfollowed for 2+ hours. Deliberately leaves the
 * decision with Kepala Cabang (owner's explicit instruction) -- the
 * monitoring function only warns and informs, never reassigns on its own.
 * Each new sales rep gets ONE consolidated WhatsApp message listing every
 * lead (name + phone) handed to them, not one message per lead.
 */
export async function tryBulkReassignAdLeadFollowUp(kepalaCabangId: string, branchId: string, messageText: string): Promise<AdLeadBulkReassignResult> {
  const match = messageText.match(BULK_REASSIGN_PATTERN);
  if (!match) return { outcome: "not_a_bulk_reassign_command" };

  const namedSales = match[1].trim();
  if (!namedSales) return { outcome: "not_a_bulk_reassign_command" };

  const supabase = createAdminClient();
  const { data: branchSalesRaw } = await supabase
    .from("employees")
    .select("id, full_name, roles:role_id(key)")
    .eq("branch_id", branchId)
    .is("deleted_at", null)
    .eq("employment_status", "active");

  const salesEmployees = (branchSalesRaw ?? [])
    .filter((e) => (e.roles as unknown as { key: string } | null)?.key === "sales")
    .map((e) => ({ id: e.id, full_name: e.full_name }));

  const needle = namedSales.toLowerCase();
  const matches = salesEmployees.filter(
    (e) => e.full_name.toLowerCase().includes(needle) || needle.split(/\s+/).some((word) => word.length >= 3 && e.full_name.toLowerCase().includes(word)),
  );
  if (matches.length === 0) return { outcome: "sales_not_found" };
  if (matches.length > 1) return { outcome: "sales_ambiguous", candidateNames: matches.map((m) => m.full_name) };

  const sourceSales = matches[0];

  const { data: leads } = await supabase
    .from("prospects")
    .select("id, customer_name, phone")
    .eq("sales_id", sourceSales.id)
    .eq("branch_id", branchId)
    .eq("lead_source", "facebook_ads")
    .is("created_by", null)
    .is("deleted_at", null)
    .is("last_follow_up_at", null)
    .not("status", "in", "(closing,inactive)");

  if (!leads || leads.length === 0) return { outcome: "no_leads_to_reassign", sourceSalesName: sourceSales.full_name };

  const assignments = new Map<string, { customerName: string | null; phone: string | null }[]>();

  for (const lead of leads) {
    const { data: targetSalesId } = await supabase.rpc("crm_pick_round_robin_sales_excluding", {
      p_branch_id: branchId,
      p_exclude_sales_id: sourceSales.id,
    });
    if (!targetSalesId) return { outcome: "no_other_sales", sourceSalesName: sourceSales.full_name };

    await supabase.from("prospects").update({ sales_id: targetSalesId as string, updated_by: kepalaCabangId }).eq("id", lead.id);

    const existing = assignments.get(targetSalesId as string) ?? [];
    existing.push({ customerName: lead.customer_name, phone: lead.phone });
    assignments.set(targetSalesId as string, existing);
  }

  for (const [targetSalesId, leadList] of assignments) {
    const { data: targetSales } = await supabase.from("employees").select("full_name, phone").eq("id", targetSalesId).maybeSingle();
    if (!targetSales?.phone) continue;

    const leadLines = leadList.map((l) => `- ${l.customerName ?? "-"} (${l.phone ?? "-"})`).join("\n");
    const notifyText = `${leadList.length} lead dialihkan ke Anda oleh Kepala Cabang dari sales lain yang tidak responsif. Segera follow up:\n${leadLines}`;
    const sendResult = await sendWhatsAppText(targetSales.phone, notifyText);
    if (!sendResult.success) {
      logger.error("tryBulkReassignAdLeadFollowUp: WA notify to new sales failed", { targetSalesId, error: sendResult.error });
    }
  }

  return { outcome: "reassigned", sourceSalesName: sourceSales.full_name, reassignedCount: leads.length };
}
