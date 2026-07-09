"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listPositions } from "@/repositories/position.repository";

export async function listPositionsAction() {
  await requireSession();
  const supabase = await createClient();
  return listPositions(supabase);
}
