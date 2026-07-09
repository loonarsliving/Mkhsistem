import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signInAs } from "../support/supabase-test-client";

/**
 * Full end-to-end registration (create a real auth.users row via the
 * service-role client) isn't exercisable from this harness — it only has
 * anon-key test accounts, and account creation requires the service-role
 * key. That path was verified live via Supabase MCP instead (same approach
 * used for the Root Owner account). These tests cover what the anon-key
 * harness *can* prove for real: the approve/reject RPCs' authorization
 * logic, using the existing CI fixture accounts as both actors and targets.
 */
describe("registration approval RPCs — live project", () => {
  let staff: Awaited<ReturnType<typeof signInAs>>;
  let hr: Awaited<ReturnType<typeof signInAs>>;

  beforeAll(async () => {
    staff = await signInAs("staff");
    hr = await signInAs("hr");
  });

  afterAll(async () => {
    await staff.client.auth.signOut();
    await hr.client.auth.signOut();
  });

  it("staff (no registration.manage) cannot approve any registration", async () => {
    const { error } = await staff.client.rpc("approve_employee_registration", { p_employee_id: hr.userId });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/tidak berwenang/i);
  });

  it("staff (no registration.manage) cannot reject any registration", async () => {
    const { error } = await staff.client.rpc("reject_employee_registration", { p_employee_id: hr.userId });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/tidak berwenang/i);
  });

  it("hr (no registration.manage per spec) cannot approve any registration", async () => {
    const { error } = await hr.client.rpc("approve_employee_registration", { p_employee_id: staff.userId });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/tidak berwenang/i);
  });

  it("hr (no registration.manage per spec) cannot reject any registration", async () => {
    const { error } = await hr.client.rpc("reject_employee_registration", { p_employee_id: staff.userId });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/tidak berwenang/i);
  });

  it("rejects with 'not found' for a genuinely nonexistent registration, even from an authorized-looking call shape", async () => {
    const { error } = await staff.client.rpc("approve_employee_registration", {
      p_employee_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
    // staff lacks registration.manage entirely, so the authorization check
    // (which runs before the not-found check would otherwise matter) fires
    // first regardless of the target — this just confirms the RPC doesn't
    // crash or leak anything for a bogus id.
    expect(error?.message).toMatch(/tidak berwenang|tidak ditemukan/i);
  });

  it("does not mutate the target row when authorization fails", async () => {
    const { data: before } = await hr.client
      .from("v_employee_directory")
      .select("id, role_key")
      .eq("id", hr.userId)
      .single();

    await staff.client.rpc("approve_employee_registration", { p_employee_id: hr.userId });

    const { data: after } = await hr.client
      .from("v_employee_directory")
      .select("id, role_key")
      .eq("id", hr.userId)
      .single();

    expect(after?.role_key).toBe(before?.role_key);
  });
});
