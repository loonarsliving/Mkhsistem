import { describe, expect, it } from "vitest";

import { formatRefundInboundBody, refundPhonesMatch } from "@/lib/ai/domains/refund-customer-chat-format";
import { formatRefundMonth } from "@/features/refund/schemas/refund.schema";
import { currentRefundMonth } from "@/repositories/refund.repository";

describe("refundPhonesMatch", () => {
  it("matches a local 08xx spreadsheet number against the 62xx WhatsApp sender id", () => {
    expect(refundPhonesMatch("081200001111", "6281200001111")).toBe(true);
    expect(refundPhonesMatch("0813-0000-222", "628130000222@s.whatsapp.net")).toBe(true);
  });

  it("does not match different numbers", () => {
    expect(refundPhonesMatch("081200001111", "6281200001112")).toBe(false);
  });

  it("never matches numbers too short to disambiguate", () => {
    expect(refundPhonesMatch("12345", "12345")).toBe(false);
    expect(refundPhonesMatch("", "6281200001111")).toBe(false);
  });
});

describe("formatRefundInboundBody", () => {
  it("keeps text as-is (trimmed)", () => {
    expect(formatRefundInboundBody({ kind: "text", text: "  kapan cair pak?  " })).toBe("kapan cair pak?");
  });

  it("records a photo with its caption and URL", () => {
    expect(formatRefundInboundBody({ kind: "image", url: "https://x/y.jpg", caption: "bukti" })).toBe("[Foto] bukti\nhttps://x/y.jpg");
    expect(formatRefundInboundBody({ kind: "image", url: "https://x/y.jpg" })).toBe("[Foto]\nhttps://x/y.jpg");
  });
});

describe("refund month helpers", () => {
  it("labels months like the CS spreadsheet columns", () => {
    expect(formatRefundMonth("2026-10-01")).toBe("Okt 26");
    expect(formatRefundMonth("2029-01-01")).toBe("Jan 29");
  });

  it("evaluates 'bulan ini' in WITA, not UTC", () => {
    // 2026-10-31 17:30 UTC is already 1 November 01:30 WITA.
    expect(currentRefundMonth(new Date("2026-10-31T17:30:00Z"))).toBe("2026-11-01");
    expect(currentRefundMonth(new Date("2026-10-14T03:00:00Z"))).toBe("2026-10-01");
  });
});
