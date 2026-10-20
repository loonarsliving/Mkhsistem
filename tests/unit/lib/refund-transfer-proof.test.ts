import { describe, expect, it } from "vitest";

import {
  buildRefundProofCustomerMessage,
  matchRefundCustomers,
  parseRefundProofCaption,
} from "@/lib/refund/transfer-proof-format";

describe("parseRefundProofCaption", () => {
  it("ignores captions that don't start with REFUND", () => {
    expect(parseRefundProofCaption("A2")).toBeNull();
    expect(parseRefundProofCaption("bukti refund budi")).toBeNull();
    expect(parseRefundProofCaption(undefined)).toBeNull();
    expect(parseRefundProofCaption("REFUND")).toBeNull();
  });

  it("reads a name or list number", () => {
    expect(parseRefundProofCaption("REFUND Budi Santoso")).toEqual({ query: "Budi Santoso", month: undefined, year: undefined });
    expect(parseRefundProofCaption("refund 7")).toEqual({ query: "7", month: undefined, year: undefined });
  });

  it("reads an optional trailing termin month", () => {
    expect(parseRefundProofCaption("REFUND Budi okt")).toEqual({ query: "Budi", month: 10, year: undefined });
    expect(parseRefundProofCaption("REFUND Budi okt 26")).toEqual({ query: "Budi", month: 10, year: 2026 });
    expect(parseRefundProofCaption("REFUND Budi Oktober-2026")).toEqual({ query: "Budi", month: 10, year: 2026 });
    expect(parseRefundProofCaption("REFUND 7 10/2026")).toEqual({ query: "7", month: 10, year: 2026 });
    expect(parseRefundProofCaption("REFUND budi agu-27")).toEqual({ query: "budi", month: 8, year: 2027 });
  });
});

describe("matchRefundCustomers", () => {
  const customers = [
    { name: "Andi Nur Rahman", sortOrder: 19 },
    { name: "Dr. Andi Wijaya S.Si, M.Si", sortOrder: 14 },
    { name: "Budi Santoso", sortOrder: 1 },
  ];

  it("matches by list number", () => {
    expect(matchRefundCustomers(customers, "14").map((c) => c.sortOrder)).toEqual([14]);
  });

  it("matches word prefixes, ignoring case and punctuation", () => {
    expect(matchRefundCustomers(customers, "bud").map((c) => c.sortOrder)).toEqual([1]);
    expect(matchRefundCustomers(customers, "andi nur").map((c) => c.sortOrder)).toEqual([19]);
    expect(matchRefundCustomers(customers, "wijaya").map((c) => c.sortOrder)).toEqual([14]);
  });

  it("returns every candidate when ambiguous, none when unknown", () => {
    expect(matchRefundCustomers(customers, "andi")).toHaveLength(2);
    expect(matchRefundCustomers(customers, "zzz")).toHaveLength(0);
  });
});

describe("buildRefundProofCustomerMessage", () => {
  it("names the termin, amount, paid total and remaining", () => {
    const text = buildRefundProofCustomerMessage({
      customerName: "Budi",
      installment: { dueMonth: "2026-10-01", amount: 10_000_000 },
      paidAmount: 20_000_000,
      remainingAmount: 30_000_000,
    });
    expect(text).toContain("termin Oktober 2026 sebesar Rp 10.000.000");
    expect(text).toContain("Total terbayar: Rp 20.000.000");
    expect(text).toContain("Sisa refund: Rp 30.000.000");
  });
});
