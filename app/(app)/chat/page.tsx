import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { PERMISSIONS } from "@/constants/rbac";
import { ChatApp } from "@/features/chat/components/chat-app";
import { logger } from "@/lib/logger";
import { hasPermission, requireSession } from "@/lib/rbac/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { listChatConversations, listChatPeople, listChatUnits, type ChatPerson, type ChatUnit } from "@/repositories/chat.repository";

export const metadata: Metadata = { title: "Chat" };
export const dynamic = "force-dynamic";

/**
 * Loonars Connect (0291): operational group chat (members only) and the
 * owner's consolidated report feed. Authentication is the app layout's
 * (middleware redirects to /login and back); what each user sees is decided
 * by RLS on group membership / hospitality.owner_report. `?c=<id>` deep-links
 * a conversation (notifications link here).
 */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireSession();
  if (!hasPermission(session, PERMISSIONS.CHAT_VIEW)) redirect("/dashboard?error=forbidden");

  // Pull any just-checked-out rooms into tasks before rendering (idempotent;
  // the 5-minute pg_cron job does the same in the background).
  try {
    await createAdminClient().rpc("mkc_hosp_sync_room_tasks");
  } catch (err) {
    logger.warn("chat page: room task sync skipped", { error: err instanceof Error ? err.message : String(err) });
  }

  const supabase = await createClient();
  const [{ c }, conversations] = await Promise.all([searchParams, listChatConversations(supabase)]);

  // Direct chats (0300) carry their own names; no department people / units to load.
  const departments = [...new Set(conversations.filter((conv) => conv.kind !== "direct").map((conv) => conv.departmentCode))];
  const peopleByDepartment: Record<string, ChatPerson[]> = {};
  const unitsByDepartment: Record<string, ChatUnit[]> = {};
  await Promise.all(
    departments.map(async (code) => {
      const [people, units] = await Promise.all([listChatPeople(supabase, code).catch(() => []), listChatUnits(supabase, code).catch(() => [])]);
      peopleByDepartment[code] = people;
      unitsByDepartment[code] = units;
    }),
  );

  const initialId = c && conversations.some((conv) => conv.id === c) ? c : null;
  const { data: canDirectChat } = await supabase.rpc("mkc_chat_direct_available");

  return (
    <ChatApp
      userId={session.userId}
      isOwner={hasPermission(session, PERMISSIONS.HOSPITALITY_OWNER_REPORT)}
      canDirectChat={canDirectChat === true}
      initialConversations={conversations}
      initialConversationId={initialId}
      peopleByDepartment={peopleByDepartment}
      unitsByDepartment={unitsByDepartment}
    />
  );
}
