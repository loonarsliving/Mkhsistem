import "server-only";

import { ROLE_KEYS } from "@/constants/rbac";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

import { formatRefundInboundBody, refundPhonesMatch, type RefundInboundContent } from "./refund-customer-chat-format";

/**
 * Customer refund chat, inbound side (0287). When a customer on the refund
 * list (mkc_refund_customers) messages the company WhatsApp, the message is
 * stored in their conversation on /refund and the Refund & Customer
 * Relation officer gets an in-app notification. No automatic reply -- a
 * person answers from the dashboard.
 *
 * Checked in webhook-handler.ts before the villa receptionist and the
 * lead/AI routes: someone owed a refund must reach the officer handling it,
 * never a sales bot or the villa receptionist.
 */
export async function tryCaptureRefundCustomerMessage(
  sender: string,
  content: RefundInboundContent,
): Promise<{ outcome: "captured"; customerName: string } | { outcome: "not_applicable" }> {
  const supabase = createAdminClient();

  const { data: customers, error } = await supabase
    .from("mkc_refund_customers")
    .select("id, customer_name, phone")
    .is("deleted_at", null)
    .not("phone", "is", null);
  if (error) {
    // Never let this module break the rest of the webhook pipeline.
    logger.warn("refund-chat: customer lookup failed", { error: error.message });
    return { outcome: "not_applicable" };
  }

  const customer = (customers ?? []).find((c) => refundPhonesMatch(c.phone ?? "", sender));
  if (!customer) return { outcome: "not_applicable" };

  const body = formatRefundInboundBody(content);
  const { error: insertError } = await supabase.from("mkc_refund_chat_messages").insert({
    customer_id: customer.id,
    direction: "inbound",
    body,
    delivery_status: "received",
  });
  if (insertError) {
    logger.warn("refund-chat: failed to store inbound message", { error: insertError.message, customer_id: customer.id });
    return { outcome: "not_applicable" };
  }

  // In-app only (refund_customer_message is not on the WA relay allowlist).
  // Falls back to Super Admin when no Refund & CR officer account exists yet,
  // so a customer's message is never silently unseen.
  const { data: roles } = await supabase
    .from("roles")
    .select("id, key")
    .in("key", [ROLE_KEYS.REFUND_CUSTOMER_RELATION, ROLE_KEYS.SUPER_ADMIN]);
  const officerRoleIds = (roles ?? []).filter((r) => r.key === ROLE_KEYS.REFUND_CUSTOMER_RELATION).map((r) => r.id);
  const { data: recipients } = await supabase
    .from("employees")
    .select("id, role_id")
    .is("deleted_at", null)
    .eq("employment_status", "active")
    .in("role_id", (roles ?? []).map((r) => r.id));
  const officers = (recipients ?? []).filter((r) => r.role_id && officerRoleIds.includes(r.role_id));
  const targets = officers.length > 0 ? officers : (recipients ?? []);

  if (targets.length > 0) {
    await supabase.from("mkc_notifications").insert(
      targets.map((t) => ({
        user_id: t.id,
        type: "system",
        category: "refund_customer_message",
        title: `Pesan dari ${customer.customer_name}`,
        body: body.length > 300 ? `${body.slice(0, 297)}...` : body,
        link: `/refund/chat?c=${customer.id}`,
        metadata: { refund_customer_id: customer.id },
      })),
    );
  }

  return { outcome: "captured", customerName: customer.customer_name };
}
