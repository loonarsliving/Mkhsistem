import { describe, expect, it } from "vitest";

import { createIssueSchema, foInspectSchema, sendTextSchema, submitSecuritySchema, updateIssueSchema } from "@/features/chat/schemas/chat.schema";

const id = "6f1c3c1e-0c1a-4a55-9b1e-2a2f8c1d9e01";

describe("chat schemas", () => {
  it("rejects an empty text message without photos", () => {
    expect(sendTextSchema.safeParse({ conversationId: id, body: "   " }).success).toBe(false);
    expect(sendTextSchema.safeParse({ conversationId: id, body: "", attachmentIds: [id] }).success).toBe(true);
  });

  it("only accepts known FO decisions and boolean checklist values", () => {
    expect(foInspectSchema.safeParse({ taskId: id, items: { kebersihan_aroma: true }, decision: "ready" }).success).toBe(true);
    expect(foInspectSchema.safeParse({ taskId: id, items: { kebersihan_aroma: "yes" }, decision: "ready" }).success).toBe(false);
    expect(foInspectSchema.safeParse({ taskId: id, items: {}, decision: "approve" }).success).toBe(false);
  });

  it("security reports accept only the security kinds", () => {
    expect(submitSecuritySchema.safeParse({ departmentCode: "hospitality", kind: "security_patrol", items: {} }).success).toBe(true);
    expect(submitSecuritySchema.safeParse({ departmentCode: "hospitality", kind: "cleaning", items: {} }).success).toBe(false);
  });

  it("an issue needs a title, a description and a known severity", () => {
    const base = { departmentCode: "hospitality", category: "security", severity: "critical", title: "Penyusup", description: "Memanjat pagar" };
    expect(createIssueSchema.safeParse(base).success).toBe(true);
    expect(createIssueSchema.safeParse({ ...base, severity: "urgent" }).success).toBe(false);
    expect(createIssueSchema.safeParse({ ...base, title: "x" }).success).toBe(false);
  });

  it("resolving or cancelling an issue requires a note; assigning requires an assignee", () => {
    expect(updateIssueSchema.safeParse({ issueId: id, action: "resolve" }).success).toBe(false);
    expect(updateIssueSchema.safeParse({ issueId: id, action: "resolve", note: "Diganti" }).success).toBe(true);
    expect(updateIssueSchema.safeParse({ issueId: id, action: "cancel", note: "" }).success).toBe(false);
    expect(updateIssueSchema.safeParse({ issueId: id, action: "assign" }).success).toBe(false);
    expect(updateIssueSchema.safeParse({ issueId: id, action: "start" }).success).toBe(true);
  });
});
