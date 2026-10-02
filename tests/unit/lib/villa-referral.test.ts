import { describe, expect, it } from "vitest";

import { parseReferralCommand } from "@/lib/ai/domains/villa-referral-request";
import { buildReferralWaMessage } from "@/lib/villa/referral";

describe("parseReferralCommand", () => {
  it("reads the employee name after REFERAL / REFERRAL, any case", () => {
    expect(parseReferralCommand("REFERAL Budi")).toBe("Budi");
    expect(parseReferralCommand("referral Budi Santoso ")).toBe("Budi Santoso");
    expect(parseReferralCommand("  Referal   rina  ")).toBe("rina");
  });

  it("ignores ordinary messages that merely mention referral", () => {
    expect(parseReferralCommand("REFERAL")).toBeNull();
    expect(parseReferralCommand("apa itu kode referal?")).toBeNull();
    expect(parseReferralCommand("Saya mau tanya referal")).toBeNull();
    expect(parseReferralCommand("LUNAS A3F2C1")).toBeNull();
  });
});

describe("buildReferralWaMessage", () => {
  it("contains the code, the fee, that the guest pays normal price, and that the fee waits for payment", () => {
    const text = buildReferralWaMessage("Budi", "REF-BUDI27", 10);
    expect(text).toContain("REF-BUDI27");
    expect(text).toContain("fee 10% dari nilai booking");
    expect(text).toContain("harga normal");
    expect(text).not.toContain("diskon");
    expect(text).toContain("setelah tamu melunasi");
    expect(text).toContain("loonars.id");
  });
});
