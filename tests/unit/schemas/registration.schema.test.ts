import { describe, expect, it } from "vitest";

import { registerSchema, rejectRegistrationSchema } from "@/features/registration/schemas/registration.schema";

const VALID = {
  fullName: "Budi Santoso",
  email: "budi@haluoleo.id",
  phone: "081234567890",
  password: "password123",
  confirmPassword: "password123",
  branchId: "b1f74848-ff37-4ba0-a16d-bbe94df9d66f",
  divisionId: "1c21f5db-f91d-4706-8364-0d34d954d344",
};

describe("registerSchema", () => {
  it("accepts a fully valid submission", () => {
    expect(registerSchema.safeParse(VALID).success).toBe(true);
  });

  it("rejects a missing full name", () => {
    expect(registerSchema.safeParse({ ...VALID, fullName: "" }).success).toBe(false);
  });

  it("rejects an invalid email format", () => {
    expect(registerSchema.safeParse({ ...VALID, email: "not-an-email" }).success).toBe(false);
  });

  it.each(["08123", "12345678901", "0712345678", "abcdefghijk"])("rejects invalid phone number %s", (phone) => {
    expect(registerSchema.safeParse({ ...VALID, phone }).success).toBe(false);
  });

  it.each(["081234567890", "6281234567890", "+6281234567890"])("accepts valid phone number %s", (phone) => {
    expect(registerSchema.safeParse({ ...VALID, phone }).success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(registerSchema.safeParse({ ...VALID, password: "short1", confirmPassword: "short1" }).success).toBe(false);
  });

  it("rejects mismatched password confirmation", () => {
    const result = registerSchema.safeParse({ ...VALID, confirmPassword: "somethingelse" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.confirmPassword).toBeDefined();
    }
  });

  it("rejects a missing branch or division", () => {
    expect(registerSchema.safeParse({ ...VALID, branchId: "" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...VALID, divisionId: "" }).success).toBe(false);
  });
});

describe("rejectRegistrationSchema", () => {
  it("accepts an employeeId with no reason", () => {
    expect(rejectRegistrationSchema.safeParse({ employeeId: "b1f74848-ff37-4ba0-a16d-bbe94df9d66f" }).success).toBe(true);
  });

  it("accepts an employeeId with a reason", () => {
    expect(
      rejectRegistrationSchema.safeParse({ employeeId: "b1f74848-ff37-4ba0-a16d-bbe94df9d66f", reason: "Data tidak lengkap" })
        .success,
    ).toBe(true);
  });

  it("rejects a non-uuid employeeId", () => {
    expect(rejectRegistrationSchema.safeParse({ employeeId: "not-a-uuid" }).success).toBe(false);
  });
});
