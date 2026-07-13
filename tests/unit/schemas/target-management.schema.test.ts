import { describe, expect, it } from "vitest";

import {
  saveAndDistributeTargetSchema,
  setProductSalesAssignmentSchema,
  targetDetailRowSchema,
  upsertProductSchema,
} from "@/features/crm/schemas/crm.schema";

const validRow = {
  productId: "11111111-1111-1111-1111-111111111111",
  targetUnit: 25,
  sellingPrice: 500000000,
  commissionPercent: 2.5,
};

const validBranchId = "22222222-2222-2222-2222-222222222222";

describe("targetDetailRowSchema", () => {
  it("accepts a valid row", () => {
    expect(targetDetailRowSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects a non-UUID productId", () => {
    expect(targetDetailRowSchema.safeParse({ ...validRow, productId: "rumah-subsidi" }).success).toBe(false);
  });

  it("rejects a negative target unit", () => {
    expect(targetDetailRowSchema.safeParse({ ...validRow, targetUnit: -1 }).success).toBe(false);
  });

  it("rejects a negative selling price", () => {
    expect(targetDetailRowSchema.safeParse({ ...validRow, sellingPrice: -1 }).success).toBe(false);
  });

  it("rejects a commission percent above 100", () => {
    expect(targetDetailRowSchema.safeParse({ ...validRow, commissionPercent: 101 }).success).toBe(false);
  });

  it("coerces string numbers from a form input", () => {
    const result = targetDetailRowSchema.safeParse({ ...validRow, targetUnit: "25", sellingPrice: "500000000" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.targetUnit).toBe(25);
      expect(result.data.sellingPrice).toBe(500000000);
    }
  });
});

describe("saveAndDistributeTargetSchema", () => {
  const valid = { branchId: validBranchId, periodMonth: 7, periodYear: 2026, details: [validRow] };

  it("accepts a valid payload with one product", () => {
    expect(saveAndDistributeTargetSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts multiple distinct products (1 branch -> many products)", () => {
    const second = { ...validRow, productId: "33333333-3333-3333-3333-333333333333" };
    const result = saveAndDistributeTargetSchema.safeParse({ ...valid, details: [validRow, second] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty product list", () => {
    expect(saveAndDistributeTargetSchema.safeParse({ ...valid, details: [] }).success).toBe(false);
  });

  it("rejects the same product appearing twice", () => {
    const result = saveAndDistributeTargetSchema.safeParse({ ...valid, details: [validRow, validRow] });
    expect(result.success).toBe(false);
  });

  it("rejects a month outside 1-12", () => {
    expect(saveAndDistributeTargetSchema.safeParse({ ...valid, periodMonth: 13 }).success).toBe(false);
  });

  it("rejects a missing branchId", () => {
    expect(saveAndDistributeTargetSchema.safeParse({ ...valid, branchId: "" }).success).toBe(false);
  });
});

describe("upsertProductSchema", () => {
  const valid = { productName: "Rumah Subsidi", category: "Rumah", unit: "unit", defaultPrice: 200000000, defaultCommission: 2, status: "active" as const };

  it("accepts a valid new product (no id)", () => {
    expect(upsertProductSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts an update payload with an id", () => {
    expect(upsertProductSchema.safeParse({ ...valid, id: validBranchId }).success).toBe(true);
  });

  it("defaults unit to 'unit' when omitted", () => {
    const { unit, ...rest } = valid;
    const result = upsertProductSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.unit).toBe("unit");
    }
  });

  it("rejects a product name under 2 characters", () => {
    expect(upsertProductSchema.safeParse({ ...valid, productName: "A" }).success).toBe(false);
  });

  it("rejects an invalid status", () => {
    expect(upsertProductSchema.safeParse({ ...valid, status: "archived" }).success).toBe(false);
  });
});

describe("setProductSalesAssignmentSchema", () => {
  it("accepts a valid assignment toggle", () => {
    const result = setProductSalesAssignmentSchema.safeParse({
      productId: validBranchId,
      salesId: "44444444-4444-4444-4444-444444444444",
      assigned: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID salesId", () => {
    const result = setProductSalesAssignmentSchema.safeParse({ productId: validBranchId, salesId: "bob", assigned: false });
    expect(result.success).toBe(false);
  });
});
