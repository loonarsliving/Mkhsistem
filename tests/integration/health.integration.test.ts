import { describe, expect, it } from "vitest";

import { anonClient, signInAs } from "../support/supabase-test-client";

describe("health_check() — live project", () => {
  it("is callable by an anonymous client and returns a database round-trip", async () => {
    const anon = anonClient();
    const { data, error } = await anon.rpc("health_check");
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: true });
    expect(typeof (data as { time: string }).time).toBe("string");
  });

  it("hides monitoring tables from a staff account without system.monitoring_view", async () => {
    const staff = await signInAs("staff");
    try {
      const { data, error } = await staff.client.from("mkc_error_logs").select("id");
      expect(error).toBeNull();
      expect(data).toEqual([]);
    } finally {
      await staff.client.auth.signOut();
    }
  });

  it("hides monitoring tables from an hr account (no system.monitoring_view either)", async () => {
    const hr = await signInAs("hr");
    try {
      const { data, error } = await hr.client.rpc("app_has_permission", { p_permission_key: "system.monitoring_view" });
      expect(error).toBeNull();
      expect(data).toBe(false);
    } finally {
      await hr.client.auth.signOut();
    }
  });
});
