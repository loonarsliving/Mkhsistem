import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/constants/rbac";
import { RefundChatPage } from "@/features/refund/components/refund-chat-page";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listRefundCustomers } from "@/repositories/refund.repository";

export const metadata: Metadata = { title: "Chat Refund" };

/**
 * Full-screen refund customer chat (WhatsApp Web style). Same inbox as the
 * Chat tab on /refund; `?c=<customer id>` opens that conversation directly,
 * which is where the "Pesan dari ..." notification links to.
 */
export default async function RefundChatRoute({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireSession();
  const canManage = hasPermission(session, PERMISSIONS.REFUND_MANAGE);
  if (!canManage && !hasPermission(session, PERMISSIONS.REFUND_VIEW)) redirect("/dashboard?error=forbidden");

  const [{ c }, customers] = await Promise.all([searchParams, listRefundCustomers(await createClient())]);
  const initialId = c && customers.some((cust) => cust.id === c) ? c : null;

  return <RefundChatPage customers={customers} canManage={canManage} initialCustomerId={initialId} />;
}
