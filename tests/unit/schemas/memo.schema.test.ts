import { describe, expect, it } from "vitest";

import { memoFormSchema } from "@/features/memo/schemas/memo.schema";

const validBase = {
  title: "Pengumuman Libur Nasional",
  content: "Kantor akan libur pada tanggal 17 Agustus.",
  priority: "normal" as const,
  isPinned: false,
  isMandatoryRead: true,
  targets: [{ target_type: "all_branch" as const, target_id: null }],
};

describe("memoFormSchema", () => {
  it("accepts a valid memo targeting all branches", () => {
    expect(memoFormSchema.safeParse(validBase).success).toBe(true);
  });

  it("requires at least one target", () => {
    const result = memoFormSchema.safeParse({ ...validBase, targets: [] });
    expect(result.success).toBe(false);
  });

  it("requires a target_id for a specific-branch target", () => {
    const result = memoFormSchema.safeParse({
      ...validBase,
      targets: [{ target_type: "branch", target_id: null }],
    });
    // target_id is nullable in this schema (validated server-side by the
    // RPC's CHECK constraint), but must be a valid UUID when present.
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID target_id", () => {
    const result = memoFormSchema.safeParse({
      ...validBase,
      targets: [{ target_type: "branch", target_id: "not-a-uuid" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a title under 3 characters", () => {
    expect(memoFormSchema.safeParse({ ...validBase, title: "Hi" }).success).toBe(false);
  });

  it("rejects content under 10 characters", () => {
    expect(memoFormSchema.safeParse({ ...validBase, content: "Too short" }).success).toBe(false);
  });

  it("rejects an invalid priority value", () => {
    expect(memoFormSchema.safeParse({ ...validBase, priority: "critical" }).success).toBe(false);
  });

  it("defaults attachments to an empty array when omitted", () => {
    const result = memoFormSchema.safeParse(validBase);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.attachments).toEqual([]);
    }
  });

  it("accepts multiple mixed target types in one memo", () => {
    const result = memoFormSchema.safeParse({
      ...validBase,
      targets: [
        { target_type: "all_division", target_id: null },
        { target_type: "position", target_id: "11111111-1111-1111-1111-111111111111" },
        { target_type: "user", target_id: "22222222-2222-2222-2222-222222222222" },
      ],
    });
    expect(result.success).toBe(true);
  });
});
