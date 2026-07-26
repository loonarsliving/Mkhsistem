import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { FRIDAY_ACTIONS, FRIDAY_ACTION_KEYS, getFridayAction, isKnownFridayAction } from "@/lib/ai/friday/action-catalog";

/**
 * The catalog exists in two places that must never disagree: this TypeScript
 * array, and the check constraint on friday_actions.action_key in migration
 * 0179. If the code gains an action the constraint does not know, every
 * briefing proposing it fails to insert — in production, at 06:30, silently.
 * This test is the thing that catches that at commit time instead.
 */
function constraintKeysFromMigration(): string[] {
  const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/0179_friday_executive_intelligence.sql"), "utf8");
  const match = sql.match(/action_key text not null check \(action_key in \(([\s\S]*?)\)\)/);
  if (!match) throw new Error("Tidak menemukan check constraint action_key di migrasi 0179");
  return [...match[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe("FRIDAY action catalog", () => {
  it("matches the action_key check constraint in migration 0179 exactly", () => {
    expect([...FRIDAY_ACTION_KEYS].sort()).toEqual(constraintKeysFromMigration().sort());
  });

  it("has no duplicate keys", () => {
    expect(new Set(FRIDAY_ACTION_KEYS).size).toBe(FRIDAY_ACTION_KEYS.length);
  });

  it("gives every action a risk tier the UI knows how to render", () => {
    for (const action of FRIDAY_ACTIONS) {
      expect(["low", "medium", "high"]).toContain(action.riskTier);
    }
  });

  it("describes every action and its payload for the prompt and the approver", () => {
    for (const action of FRIDAY_ACTIONS) {
      expect(action.description.trim().length).toBeGreaterThan(20);
      expect(action.payloadHint.trim().length).toBeGreaterThan(0);
      expect(action.label.trim().length).toBeGreaterThan(0);
    }
  });

  it("resolves known keys and refuses unknown ones", () => {
    expect(isKnownFridayAction("enqueue_sales_coaching")).toBe(true);
    expect(isKnownFridayAction("drop_database")).toBe(false);
    expect(getFridayAction("drop_database")).toBeNull();
    expect(getFridayAction("enqueue_sales_coaching")?.key).toBe("enqueue_sales_coaching");
  });

  it("contains no action that spends budget or reaches a customer", () => {
    // The catalog's stated safety property (see its module doc). If a future
    // action genuinely needs to launch an ad or message a customer, this test
    // should be updated deliberately -- with the approval flow re-examined --
    // not quietly deleted.
    const forbidden = ["launch", "publish", "broadcast_customer", "send_promo", "charge", "payment"];
    for (const key of FRIDAY_ACTION_KEYS) {
      for (const word of forbidden) {
        expect(key).not.toContain(word);
      }
    }
  });
});
