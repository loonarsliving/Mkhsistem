import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signInAs } from "../support/supabase-test-client";

describe("Memo targeting, visibility, and read receipts — live project", () => {
  let staff: Awaited<ReturnType<typeof signInAs>>;
  let hr: Awaited<ReturnType<typeof signInAs>>;
  let memoId: string;

  beforeAll(async () => {
    staff = await signInAs("staff");
    hr = await signInAs("hr");
  });

  afterAll(async () => {
    if (memoId) {
      // hr created it, so hr can delete it (memos_delete policy).
      await hr.client.from("memos").delete().eq("id", memoId);
    }
    await staff.client.auth.signOut();
    await hr.client.auth.signOut();
  });

  it("lets HR create a memo targeted at a specific user via the create_memo RPC", async () => {
    const { data, error } = await hr.client.rpc("create_memo", {
      p_title: "[vitest] Integration test memo",
      p_content: "This memo is created and torn down automatically by the integration test suite.",
      p_priority: "low",
      p_is_pinned: false,
      p_is_mandatory_read: true,
      p_expires_at: null,
      p_targets: [{ target_type: "user", target_id: staff.userId }],
      p_attachments: [],
    });

    expect(error).toBeNull();
    expect(typeof data).toBe("string");
    memoId = data as string;
  });

  it("is visible to the targeted staff user", async () => {
    const { data, error } = await staff.client.from("memos").select("id, title").eq("id", memoId).single();
    expect(error).toBeNull();
    expect(data?.title).toBe("[vitest] Integration test memo");
  });

  it("is not visible to staff before they were targeted (sanity: audience is real, not blanket access)", async () => {
    // Create a second memo targeted at HR's own branch-position combo that
    // the staff test account does not hold, and confirm staff cannot see it.
    const { data: otherMemoId, error: createError } = await hr.client.rpc("create_memo", {
      p_title: "[vitest] Not for staff",
      p_content: "This memo should never be visible to the staff test account.",
      p_priority: "low",
      p_is_pinned: false,
      p_is_mandatory_read: false,
      p_expires_at: null,
      p_targets: [{ target_type: "user", target_id: hr.userId }],
      p_attachments: [],
    });
    expect(createError).toBeNull();

    const { data, error } = await staff.client.from("memos").select("id").eq("id", otherMemoId as string);
    expect(error).toBeNull();
    expect(data).toEqual([]);

    await hr.client.from("memos").delete().eq("id", otherMemoId as string);
  });

  it("records a read receipt via mark_memo_read", async () => {
    const { error } = await staff.client.rpc("mark_memo_read", { p_memo_id: memoId });
    expect(error).toBeNull();

    const { data, error: readError } = await staff.client
      .from("memo_reads")
      .select("user_id")
      .eq("memo_id", memoId)
      .eq("user_id", staff.userId);
    expect(readError).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("rejects memo creation from an account without memo.create", async () => {
    const { error } = await staff.client.rpc("create_memo", {
      p_title: "Should be rejected",
      p_content: "Staff test account does not have memo.create.",
      p_priority: "low",
      p_is_pinned: false,
      p_is_mandatory_read: false,
      p_expires_at: null,
      p_targets: [{ target_type: "all_branch", target_id: null }],
      p_attachments: [],
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/permission/i);
  });
});
