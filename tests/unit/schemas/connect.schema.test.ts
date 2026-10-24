import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  createContentSchema,
  createKolSchema,
  createLeadSchema,
  dailyReportSchema,
  decideKolSchema,
  updateContentSchema,
  updateKolSchema,
  visitResultSchema,
} from "@/features/chat/schemas/connect.schema";
import { CONTENT_FORMATS, CONTENT_PLATFORMS, CONTENT_TOPICS, KOL_DELIVERABLES } from "@/lib/connect/labels";

const id = "8f9c6a52-2c7e-4f0e-9a51-0d3f4b1c2e11";
const sql = readFileSync(join(process.cwd(), "supabase/migrations/0294_loonars_connect_markom_sales_jogja.sql"), "utf8");
const checkList = (column: string) => {
  const m = new RegExp(`${column} text not null[^\\n]*check \\(${column} in \\(([^)]*)\\)`).exec(sql);
  return [...m![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
};

describe("connect schemas mirror migration 0294", () => {
  it("content platform / format / topic lists match the CHECK constraints", () => {
    const plans = sql.slice(sql.indexOf("create table public.mkc_mkt_content_plans"));
    const local = (col: string) => [...new RegExp(`${col} text not null check \\(${col} in \\(([^)]*)\\)`).exec(plans)![1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]);
    expect([...CONTENT_PLATFORMS]).toEqual(local("platform"));
    expect([...CONTENT_FORMATS]).toEqual(local("format"));
    expect([...CONTENT_TOPICS]).toEqual(local("topic"));
  });

  it("KOL deliverables match the CHECK constraint", () => {
    const m = /deliverables <@ array\[([^\]]*)\]/.exec(sql)!;
    expect([...KOL_DELIVERABLES]).toEqual([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
    expect(checkList("compensation")).toEqual(["barter", "paid", "barter_paid"]);
  });
});

describe("Markom inputs", () => {
  it("content plan needs a title and a date", () => {
    const base = { departmentCode: "markom_jogja", plannedDate: "2026-10-25", platform: "instagram", format: "reels", topic: "villa", title: "Room tour" };
    expect(createContentSchema.safeParse(base).success).toBe(true);
    expect(createContentSchema.safeParse({ ...base, title: "ab" }).success).toBe(false);
    expect(createContentSchema.safeParse({ ...base, plannedDate: "25-10-2026" }).success).toBe(false);
  });

  it("publishing needs a link, cancelling needs a reason", () => {
    expect(updateContentSchema.safeParse({ id, action: "publish" }).success).toBe(false);
    expect(updateContentSchema.safeParse({ id, action: "publish", url: "https://instagram.com/reel/x" }).success).toBe(true);
    expect(updateContentSchema.safeParse({ id, action: "publish", url: "instagram.com/reel/x" }).success).toBe(false);
    expect(updateContentSchema.safeParse({ id, action: "cancel" }).success).toBe(false);
    expect(updateContentSchema.safeParse({ id, action: "start" }).success).toBe(true);
  });

  it("KOL request: 1-7 nights and at least one deliverable", () => {
    const base = {
      departmentCode: "markom_jogja",
      kolHandle: "@kol",
      platform: "instagram",
      compensation: "barter",
      requestedCheckin: "2026-11-01",
      nights: 2,
      deliverables: ["reels"],
    };
    expect(createKolSchema.safeParse(base).success).toBe(true);
    expect(createKolSchema.safeParse({ ...base, nights: 8 }).success).toBe(false);
    expect(createKolSchema.safeParse({ ...base, deliverables: [] }).success).toBe(false);
    expect(createKolSchema.safeParse({ ...base, deliverables: ["youtube_short"] }).success).toBe(false);
  });

  it("Rebecca's decision: approve needs unit+date+nights, reject needs a reason", () => {
    expect(decideKolSchema.safeParse({ kolId: id, decision: "approve" }).success).toBe(false);
    expect(decideKolSchema.safeParse({ kolId: id, decision: "approve", unitId: id, checkin: "2026-11-01", nights: 2 }).success).toBe(true);
    expect(decideKolSchema.safeParse({ kolId: id, decision: "reject" }).success).toBe(false);
    expect(decideKolSchema.safeParse({ kolId: id, decision: "reject", note: "Unit penuh" }).success).toBe(true);
  });

  it("a delivered KOL post needs the deliverable and its link", () => {
    expect(updateKolSchema.safeParse({ kolId: id, action: "deliverable", key: "reels" }).success).toBe(false);
    expect(updateKolSchema.safeParse({ kolId: id, action: "deliverable", key: "reels", url: "https://x.com/p" }).success).toBe(true);
    expect(updateKolSchema.safeParse({ kolId: id, action: "cancel" }).success).toBe(false);
  });
});

describe("Sales inputs", () => {
  it("lead needs a plausible phone number", () => {
    const base = { departmentCode: "sales_jogja", customerName: "Budi", phone: "0812 3456 7890", houseType: "Avara", city: "Sleman", leadSource: "instagram" };
    expect(createLeadSchema.safeParse(base).success).toBe(true);
    expect(createLeadSchema.safeParse({ ...base, phone: "12" }).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, leadSource: "billboard" }).success).toBe(false);
  });

  it("a finished visit needs its result", () => {
    expect(visitResultSchema.safeParse({ visitId: id, outcome: "done" }).success).toBe(false);
    expect(visitResultSchema.safeParse({ visitId: id, outcome: "done", note: "Minat Avara" }).success).toBe(true);
    expect(visitResultSchema.safeParse({ visitId: id, outcome: "no_show" }).success).toBe(true);
  });

  it("daily report must answer every checklist point", () => {
    const items = { lead_baru_dihubungi: true, follow_up_dicatat_crm: false, materi_promosi_dibagikan: true };
    expect(dailyReportSchema.safeParse({ departmentCode: "sales_jogja", items, followUps: 3, visits: 0, hot: 1 }).success).toBe(true);
    expect(dailyReportSchema.safeParse({ departmentCode: "sales_jogja", items: { lead_baru_dihubungi: true }, followUps: 3, visits: 0, hot: 1 }).success).toBe(false);
  });
});
