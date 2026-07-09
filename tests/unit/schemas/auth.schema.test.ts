import { describe, expect, it } from "vitest";

import { forgotPasswordSchema, loginSchema, resetPasswordSchema } from "@/features/auth/schemas/auth.schema";

describe("loginSchema", () => {
  it("accepts a valid email/password pair", () => {
    const result = loginSchema.safeParse({ email: "user@haluoleo.id", password: "anything" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "anything" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "user@haluoleo.id", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "user@haluoleo.id" }).success).toBe(true);
  });

  it("rejects an empty email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const strong = "Str0ng!Passw0rd";

  it("accepts a strong password with matching confirmation", () => {
    const result = resetPasswordSchema.safeParse({ password: strong, confirmPassword: strong });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched confirmation", () => {
    const result = resetPasswordSchema.safeParse({ password: strong, confirmPassword: "Different1!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["confirmPassword"]);
    }
  });

  it.each([
    ["too short", "Ab1!"],
    ["no uppercase", "weak1234!"],
    ["no lowercase", "WEAK1234!"],
    ["no digit", "WeakPassword!"],
  ])("rejects a password that is %s", (_label, password) => {
    const result = resetPasswordSchema.safeParse({ password, confirmPassword: password });
    expect(result.success).toBe(false);
  });
});
