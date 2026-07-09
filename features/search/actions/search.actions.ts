"use server";

import { requireSession } from "@/lib/rbac/session";
import { createClient } from "@/lib/supabase/server";
import { globalSearch, type GlobalSearchResults } from "@/repositories/search.repository";

export async function globalSearchAction(query: string): Promise<GlobalSearchResults> {
  await requireSession();
  if (query.trim().length < 2) {
    return { memos: [], announcements: [], employees: [] };
  }
  const supabase = await createClient();
  return globalSearch(supabase, query.trim());
}
