import { describe, expect, it } from "vitest";

import { siteplanProjectSchema, siteplanPurchaseSchema, siteplanUnitSchema } from "@/features/siteplan/schemas/siteplan.schema";

const unitId = "11111111-1111-1111-1111-111111111111";

const baseBooking = {
  unitId,
  buyerName: "Budi Santoso",
  transactionType: "booking" as const,
  paymentMethod: "cash" as const,
  price: 500_000_000,
  bookingFee: 5_000_000,
};

describe("siteplanPurchaseSchema", () => {
  it("accepts a valid booking purchase (price + booking fee)", () => {
    expect(siteplanPurchaseSchema.safeParse(baseBooking).success).toBe(true);
  });

  it("rejects a booking purchase missing the booking fee", () => {
    const result = siteplanPurchaseSchema.safeParse({ ...baseBooking, bookingFee: undefined });
    expect(result.success).toBe(false);
  });

  it("rejects any transaction type missing price", () => {
    const result = siteplanPurchaseSchema.safeParse({ ...baseBooking, price: undefined });
    expect(result.success).toBe(false);
  });

  it("accepts a valid dp purchase (price + dp amount + handover date)", () => {
    const result = siteplanPurchaseSchema.safeParse({
      unitId,
      buyerName: "Siti Aminah",
      transactionType: "dp",
      paymentMethod: "kpr",
      price: 500_000_000,
      dpAmount: 100_000_000,
      handoverDate: "2026-12-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a dp purchase missing the dp amount", () => {
    const result = siteplanPurchaseSchema.safeParse({
      unitId,
      buyerName: "Siti Aminah",
      transactionType: "dp",
      paymentMethod: "kpr",
      price: 500_000_000,
      handoverDate: "2026-12-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a dp purchase missing the handover date", () => {
    const result = siteplanPurchaseSchema.safeParse({
      unitId,
      buyerName: "Siti Aminah",
      transactionType: "dp",
      paymentMethod: "kpr",
      price: 500_000_000,
      dpAmount: 100_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid akad purchase (price lunas + handover date)", () => {
    const result = siteplanPurchaseSchema.safeParse({
      unitId,
      buyerName: "Andi Wijaya",
      transactionType: "akad",
      paymentMethod: "both",
      price: 500_000_000,
      handoverDate: "2026-12-01",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an akad purchase missing the handover date", () => {
    const result = siteplanPurchaseSchema.safeParse({
      unitId,
      buyerName: "Andi Wijaya",
      transactionType: "akad",
      paymentMethod: "both",
      price: 500_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid payment method", () => {
    const result = siteplanPurchaseSchema.safeParse({ ...baseBooking, paymentMethod: "transfer" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid transaction type", () => {
    const result = siteplanPurchaseSchema.safeParse({ ...baseBooking, transactionType: "lunas" });
    expect(result.success).toBe(false);
  });

  it("rejects a buyer name that's too short", () => {
    const result = siteplanPurchaseSchema.safeParse({ ...baseBooking, buyerName: "A" });
    expect(result.success).toBe(false);
  });
});

describe("siteplanProjectSchema", () => {
  it("accepts a valid project", () => {
    expect(siteplanProjectSchema.safeParse({ kode: "LV-01", nama: "Loonars Villa" }).success).toBe(true);
  });

  it("rejects a missing kode", () => {
    expect(siteplanProjectSchema.safeParse({ kode: "", nama: "Loonars Villa" }).success).toBe(false);
  });
});

describe("siteplanUnitSchema", () => {
  const projectId = "22222222-2222-2222-2222-222222222222";

  it("accepts a valid unit", () => {
    expect(siteplanUnitSchema.safeParse({ projectId, blok: "C1" }).success).toBe(true);
  });

  it("rejects a missing blok code", () => {
    expect(siteplanUnitSchema.safeParse({ projectId, blok: "" }).success).toBe(false);
  });

  it("coerces a string harga from a form input", () => {
    const result = siteplanUnitSchema.safeParse({ projectId, blok: "C1", harga: "500000000" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.harga).toBe(500_000_000);
  });
});
