import { notFound } from "next/navigation";

import { ROLE_KEYS } from "@/constants/rbac";
import { requireSession } from "@/lib/rbac/session";
import type { CurrentSession } from "@/types/domain";

/**
 * KontenAI is still a mocked production pipeline, so access is restricted
 * to Super Admin only regardless of who else holds content_planner.view --
 * permissions are shared across roles, so that permission alone can't
 * express "only this one role."
 */
export async function requireKontenAiAccess(): Promise<CurrentSession> {
  const session = await requireSession();
  if (session.roleKey !== ROLE_KEYS.SUPER_ADMIN) notFound();
  return session;
}
