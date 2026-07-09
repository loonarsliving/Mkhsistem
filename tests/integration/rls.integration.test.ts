import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { anonClient, signInAs } from "../support/supabase-test-client";

describe("Row Level Security — live project", () => {
  it("blocks anonymous reads of employees entirely", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("employees").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("blocks anonymous reads of attendance entirely", async () => {
    const anon = anonClient();
    const { data, error } = await anon.from("attendance").select("id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  describe("as staff (no elevated permissions)", () => {
    let staff: Awaited<ReturnType<typeof signInAs>>;

    beforeAll(async () => {
      staff = await signInAs("staff");
    });

    afterAll(async () => {
      await staff.client.auth.signOut();
    });

    it("can see its own row in the employee directory", async () => {
      const { data, error } = await staff.client.from("v_employee_directory").select("id, employee_code").eq(
        "id",
        staff.userId,
      );
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data?.[0]?.employee_code).toBe("TEST-STAFF-001");
    });

    it("cannot see employees from outside its own row (no employee.view_branch/view_all)", async () => {
      const { data, error } = await staff.client
        .from("v_employee_directory")
        .select("id")
        .neq("id", staff.userId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("resolves app_has_permission(employee.manage) to false", async () => {
      const { data, error } = await staff.client.rpc("app_has_permission", { p_permission_key: "employee.manage" });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });

    it("resolves app_current_role_key() to staff", async () => {
      const { data, error } = await staff.client.rpc("app_current_role_key");
      expect(error).toBeNull();
      expect(data).toBe("staff");
    });

    it("cannot decide a leave request (requires attendance.manage)", async () => {
      const { error } = await staff.client.rpc("decide_leave_request", {
        p_leave_request_id: "00000000-0000-0000-0000-000000000000",
        p_approve: true,
      });
      expect(error).not.toBeNull();
      expect(error?.message).toMatch(/permission/i);
    });
  });

  describe("as HR (employee.view_all + attendance.manage)", () => {
    let hr: Awaited<ReturnType<typeof signInAs>>;

    beforeAll(async () => {
      hr = await signInAs("hr");
    });

    afterAll(async () => {
      await hr.client.auth.signOut();
    });

    it("can see employees outside its own row", async () => {
      const { data, error } = await hr.client.from("v_employee_directory").select("id").neq("id", hr.userId);
      expect(error).toBeNull();
      expect((data ?? []).length).toBeGreaterThan(0);
    });

    it("resolves app_has_permission(employee.manage) to true", async () => {
      const { data, error } = await hr.client.rpc("app_has_permission", { p_permission_key: "employee.manage" });
      expect(error).toBeNull();
      expect(data).toBe(true);
    });

    it("resolves app_has_permission(settings.manage) to false (HR does not manage company settings)", async () => {
      const { data, error } = await hr.client.rpc("app_has_permission", { p_permission_key: "settings.manage" });
      expect(error).toBeNull();
      expect(data).toBe(false);
    });
  });
});
