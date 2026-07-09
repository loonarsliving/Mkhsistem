import { describe, expect, it } from "vitest";

import { branchSchema } from "@/features/branches/schemas/branch.schema";

const valid = {
  code: "kdi",
  name: "Kendari",
  latitude: -3.9985,
  longitude: 122.5127,
  radiusMeters: 100,
  isHeadOffice: false,
  isActive: true,
};

describe("branchSchema", () => {
  it("accepts a valid branch and uppercases the code", () => {
    const result = branchSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.code).toBe("KDI");
    }
  });

  it("allows null coordinates (office location not yet set)", () => {
    const result = branchSchema.safeParse({ ...valid, latitude: null, longitude: null });
    expect(result.success).toBe(true);
  });

  it("rejects an out-of-range latitude", () => {
    expect(branchSchema.safeParse({ ...valid, latitude: 120 }).success).toBe(false);
  });

  it("rejects an out-of-range longitude", () => {
    expect(branchSchema.safeParse({ ...valid, longitude: -200 }).success).toBe(false);
  });

  it("rejects a radius below the 10m floor", () => {
    expect(branchSchema.safeParse({ ...valid, radiusMeters: 5 }).success).toBe(false);
  });

  it("rejects a radius above the 5000m cap", () => {
    expect(branchSchema.safeParse({ ...valid, radiusMeters: 5001 }).success).toBe(false);
  });

  it("coerces a string radius from a form input", () => {
    const result = branchSchema.safeParse({ ...valid, radiusMeters: "150" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.radiusMeters).toBe(150);
    }
  });

  it("rejects a code shorter than 2 characters", () => {
    expect(branchSchema.safeParse({ ...valid, code: "A" }).success).toBe(false);
  });
});
