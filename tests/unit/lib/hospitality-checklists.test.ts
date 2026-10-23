import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CHECKLIST_ITEMS, CHECKLIST_KINDS } from "@/lib/hospitality/checklists";

/**
 * The database validates checklist submissions (mkc_hosp_checklist_items in
 * 0291); lib/hospitality/checklists.ts only labels them. If the two drift, a
 * form would send keys the database rejects -- or skip ones it requires.
 */
describe("hospitality checklist keys match migration 0291", () => {
  const sql = readFileSync(join(process.cwd(), "supabase/migrations/0291_loonars_connect_hospitality_chat.sql"), "utf8");
  const fn = sql.slice(sql.indexOf("function public.mkc_hosp_checklist_items"), sql.indexOf("-- Helpers"));

  it.each(CHECKLIST_KINDS)("%s", (kind) => {
    const match = new RegExp(`when '${kind}' then array\\[([^\\]]+)\\]`).exec(fn);
    expect(match, `no SQL definition for ${kind}`).not.toBeNull();
    const sqlKeys = [...match![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(CHECKLIST_ITEMS[kind].map((i) => i.key)).toEqual(sqlKeys);
  });
});
