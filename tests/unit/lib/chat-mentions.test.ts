import { describe, expect, it } from "vitest";

import { findMentionQuery, insertMention, mentionCandidates, mentionIdsInText } from "@/features/chat/components/mentions";
import type { ChatPerson } from "@/repositories/chat.repository";

const people: ChatPerson[] = [
  { id: "me", name: "Avi Perdana", role: "member", active: true },
  { id: "f", name: "Fety Puspitasari", role: "member", active: true },
  { id: "y", name: "Yudha", role: "member", active: true },
  { id: "old", name: "Fajar", role: "member", active: false },
  { id: "owner-only", name: "Fransiska", role: null, active: true },
  { id: "f", name: "Fety Puspitasari", role: null, active: true },
];

describe("findMentionQuery", () => {
  it("finds the @query right before the caret", () => {
    expect(findMentionQuery("tolong @fe", 10)).toEqual({ start: 7, query: "fe" });
    expect(findMentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("ignores an email address, a finished tag and text after a space", () => {
    expect(findMentionQuery("kirim ke a@b.com", 16)).toBeNull();
    expect(findMentionQuery("@Fety Puspitasari ok", 20)).toBeNull();
    expect(findMentionQuery("halo semua", 10)).toBeNull();
  });
});

describe("mentionCandidates", () => {
  it("lists active members other than me, once each, matching any name part", () => {
    expect(mentionCandidates(people, "me", "").map((p) => p.id)).toEqual(["f", "y"]);
    expect(mentionCandidates(people, "me", "pus").map((p) => p.id)).toEqual(["f"]);
    expect(mentionCandidates(people, "me", "fa")).toEqual([]);
  });
});

describe("insertMention / mentionIdsInText", () => {
  it("replaces the typed query with the full name and moves the caret after it", () => {
    expect(insertMention("tolong @fe cek", 7, 10, "Fety Puspitasari")).toEqual({ text: "tolong @Fety Puspitasari  cek", caret: 25 });
  });

  it("keeps only tags whose @Name is still in the text", () => {
    const picked = [
      { id: "f", name: "Fety Puspitasari" },
      { id: "y", name: "Yudha" },
    ];
    expect(mentionIdsInText("@Fety Puspitasari tolong cek", picked)).toEqual(["f"]);
    expect(mentionIdsInText("tidak jadi", picked)).toEqual([]);
  });
});
