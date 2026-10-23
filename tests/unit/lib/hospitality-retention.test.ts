import { describe, expect, it } from "vitest";

import { retryDelayMs, selectDueForDeletion, type RetentionCandidate } from "@/lib/hospitality/retention";

const now = new Date("2026-11-30T10:00:00Z");
const base: RetentionCandidate = {
  id: "a",
  object_path: "c/u/a.jpg",
  expires_at: "2026-11-29T10:00:00Z",
  retention_hold_until: null,
  deleted_at: null,
  delete_attempts: 0,
  last_delete_attempt_at: null,
};

describe("evidence retention selection", () => {
  it("deletes an expired, unheld, never-attempted file", () => {
    expect(selectDueForDeletion([base], now).map((r) => r.id)).toEqual(["a"]);
  });

  it("keeps a file that has not reached its 30 days", () => {
    expect(selectDueForDeletion([{ ...base, expires_at: "2026-12-01T00:00:00Z" }], now)).toEqual([]);
  });

  it("keeps a file under an active retention hold, deletes it once the hold lapses", () => {
    expect(selectDueForDeletion([{ ...base, retention_hold_until: "2026-12-31T00:00:00Z" }], now)).toEqual([]);
    expect(selectDueForDeletion([{ ...base, retention_hold_until: "2026-11-30T09:00:00Z" }], now)).toHaveLength(1);
  });

  it("never re-processes an already deleted file", () => {
    expect(selectDueForDeletion([{ ...base, deleted_at: "2026-11-29T11:00:00Z" }], now)).toEqual([]);
  });

  it("retries a failed delete only after its backoff", () => {
    const failedRecently = { ...base, delete_attempts: 1, last_delete_attempt_at: "2026-11-30T09:30:00Z" };
    const failedLongAgo = { ...base, delete_attempts: 1, last_delete_attempt_at: "2026-11-30T08:30:00Z" };
    expect(selectDueForDeletion([failedRecently], now)).toEqual([]);
    expect(selectDueForDeletion([failedLongAgo], now)).toHaveLength(1);
  });

  it("backs off exponentially, capped at 24 hours", () => {
    expect(retryDelayMs(1)).toBe(3_600_000);
    expect(retryDelayMs(3)).toBe(4 * 3_600_000);
    expect(retryDelayMs(10)).toBe(24 * 3_600_000);
  });
});
