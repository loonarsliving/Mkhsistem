import { describe, expect, it } from "vitest";

import { anonClient } from "../support/supabase-test-client";

describe("login rate limiting — live project", () => {
  it("is not locked before any failed attempts", async () => {
    const anon = anonClient();
    const email = `lockout-test-${crypto.randomUUID()}@example.invalid`;

    const { data: locked, error } = await anon.rpc("check_login_lockout", { p_email: email });
    expect(error).toBeNull();
    expect(locked).toBe(false);
  });

  it("locks out after 5 recorded failed attempts within the window", async () => {
    const anon = anonClient();
    const email = `lockout-test-${crypto.randomUUID()}@example.invalid`;

    for (let i = 0; i < 5; i += 1) {
      const { error } = await anon.rpc("record_login_attempt", { p_email: email, p_success: false });
      expect(error).toBeNull();
    }

    const { data: locked, error } = await anon.rpc("check_login_lockout", { p_email: email });
    expect(error).toBeNull();
    expect(locked).toBe(true);
  });

  it("does not lock out an email with fewer than 5 failed attempts", async () => {
    const anon = anonClient();
    const email = `lockout-test-${crypto.randomUUID()}@example.invalid`;

    for (let i = 0; i < 4; i += 1) {
      await anon.rpc("record_login_attempt", { p_email: email, p_success: false });
    }

    const { data: locked } = await anon.rpc("check_login_lockout", { p_email: email });
    expect(locked).toBe(false);
  });

  it("is case- and whitespace-insensitive on the email", async () => {
    const anon = anonClient();
    const base = `lockout-test-${crypto.randomUUID()}`;

    for (let i = 0; i < 5; i += 1) {
      await anon.rpc("record_login_attempt", { p_email: `  ${base}@Example.Invalid  `, p_success: false });
    }

    const { data: locked } = await anon.rpc("check_login_lockout", { p_email: `${base}@example.invalid` });
    expect(locked).toBe(true);
  });
});
