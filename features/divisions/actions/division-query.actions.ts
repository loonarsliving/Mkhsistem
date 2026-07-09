"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { listDivisions } from "@/repositories/division.repository";

export async function listDivisionsAction() {
  await requireSession();
  const supabase = await createClient();
  return listDivisions(supabase);
}
