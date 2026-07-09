import { escapePostgrestOrValue } from "@/lib/utils";
import type { TypedSupabaseClient } from "@/lib/supabase/types";

export interface GlobalSearchResults {
  memos: { id: string; title: string }[];
  announcements: { id: string; title: string }[];
  employees: { id: string; full_name: string; employee_code: string; avatar_url: string | null }[];
}

export async function globalSearch(supabase: TypedSupabaseClient, query: string): Promise<GlobalSearchResults> {
  const term = `%${query}%`;
  const safeTerm = escapePostgrestOrValue(term);

  const [memos, announcements, employees] = await Promise.all([
    supabase.from("memos").select("id, title").is("deleted_at", null).ilike("title", term).limit(5),
    supabase.from("announcements").select("id, title").is("deleted_at", null).ilike("title", term).limit(5),
    supabase
      .from("v_employee_directory")
      .select("id, full_name, employee_code, avatar_url")
      .is("deleted_at", null)
      .or(`full_name.ilike.${safeTerm},employee_code.ilike.${safeTerm}`)
      .limit(5),
  ]);

  return {
    memos: memos.data ?? [],
    announcements: announcements.data ?? [],
    employees: employees.data ?? [],
  };
}
