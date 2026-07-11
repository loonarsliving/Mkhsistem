import { describe, expect, it } from "vitest";

import { assignChecklistSchema, updateTaskSchema, verifyTaskSchema } from "@/features/markom/schemas/markom.schema";

const validAssign = {
  branchId: "11111111-1111-1111-1111-111111111111",
  periodYear: 2026,
  periodMonth: 8,
  periodWeek: 2,
  items: [{ title: "5 Instagram Reels", description: "Konten produk minggu ini", dueDate: "2026-08-14" }],
};

describe("assignChecklistSchema", () => {
  it("accepts a valid checklist assignment", () => {
    expect(assignChecklistSchema.safeParse(validAssign).success).toBe(true);
  });

  it("rejects an assignment with zero items", () => {
    expect(assignChecklistSchema.safeParse({ ...validAssign, items: [] }).success).toBe(false);
  });

  it("rejects an item with a title under 2 characters", () => {
    expect(assignChecklistSchema.safeParse({ ...validAssign, items: [{ title: "A" }] }).success).toBe(false);
  });

  it("rejects a week outside 1-5", () => {
    expect(assignChecklistSchema.safeParse({ ...validAssign, periodWeek: 6 }).success).toBe(false);
  });

  it("rejects a month outside 1-12", () => {
    expect(assignChecklistSchema.safeParse({ ...validAssign, periodMonth: 13 }).success).toBe(false);
  });

  it("allows an item without description or due date", () => {
    const result = assignChecklistSchema.safeParse({ ...validAssign, items: [{ title: "3 TikTok Videos" }] });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid branchId", () => {
    expect(assignChecklistSchema.safeParse({ ...validAssign, branchId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("accepts a valid update", () => {
    const result = updateTaskSchema.safeParse({
      taskId: "11111111-1111-1111-1111-111111111111",
      title: "5 Instagram Reels (revised)",
      description: "Updated brief",
      dueDate: "2026-08-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    expect(
      updateTaskSchema.safeParse({ taskId: "11111111-1111-1111-1111-111111111111", title: "A" }).success,
    ).toBe(false);
  });
});

describe("verifyTaskSchema", () => {
  it("accepts completed with no notes", () => {
    const result = verifyTaskSchema.safeParse({ taskId: "11111111-1111-1111-1111-111111111111", status: "completed" });
    expect(result.success).toBe(true);
  });

  it("accepts rejected with notes", () => {
    const result = verifyTaskSchema.safeParse({
      taskId: "11111111-1111-1111-1111-111111111111",
      status: "rejected",
      notes: "Belum sesuai brief",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    expect(
      verifyTaskSchema.safeParse({ taskId: "11111111-1111-1111-1111-111111111111", status: "done" }).success,
    ).toBe(false);
  });
});
