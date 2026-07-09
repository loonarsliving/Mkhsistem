import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { signInAs } from "../support/supabase-test-client";

// Head Office coordinates seeded in supabase/seed/02_reference_seed.sql —
// well within its 150m radius, so this should always resolve to "hadir"/"terlambat",
// never a distance-related rejection.
const HEAD_OFFICE_LAT = -3.9778;
const HEAD_OFFICE_LNG = 122.5194;
const today = new Date().toISOString().slice(0, 10);

describe("Attendance check-in/out — live project", () => {
  let staff: Awaited<ReturnType<typeof signInAs>>;
  let hr: Awaited<ReturnType<typeof signInAs>>;

  beforeAll(async () => {
    staff = await signInAs("staff");
    hr = await signInAs("hr");
    // Ensure a clean slate in case a previous run was interrupted before cleanup.
    await hr.client.from("attendance").delete().eq("user_id", staff.userId).eq("attendance_date", today);
  });

  afterAll(async () => {
    // Clean up so the suite is safely re-runnable on the same day.
    await hr.client.from("attendance").delete().eq("user_id", staff.userId).eq("attendance_date", today);
    await staff.client.auth.signOut();
    await hr.client.auth.signOut();
  });

  it("checks in successfully and returns a hadir/terlambat status", async () => {
    const { data, error } = await staff.client.rpc("attendance_check_in", {
      p_latitude: HEAD_OFFICE_LAT,
      p_longitude: HEAD_OFFICE_LNG,
      p_photo_url: `integration-test/${staff.userId}/selfie.jpg`,
      p_note: "vitest integration test check-in",
    });

    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(["hadir", "terlambat"]).toContain(data?.status);
    expect(data?.check_in_within_radius).toBe(true);
    expect(data?.check_in_time).not.toBeNull();
    expect(data?.check_out_time).toBeNull();
  });

  it("rejects a second check-in on the same day", async () => {
    const { error } = await staff.client.rpc("attendance_check_in", {
      p_latitude: HEAD_OFFICE_LAT,
      p_longitude: HEAD_OFFICE_LNG,
      p_photo_url: `integration-test/${staff.userId}/selfie2.jpg`,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/already checked in/i);
  });

  it("checks out successfully and records a work duration", async () => {
    const { data, error } = await staff.client.rpc("attendance_check_out", {
      p_latitude: HEAD_OFFICE_LAT,
      p_longitude: HEAD_OFFICE_LNG,
      p_photo_url: `integration-test/${staff.userId}/selfie-out.jpg`,
      p_note: "vitest integration test check-out",
    });

    expect(error).toBeNull();
    expect(data?.check_out_time).not.toBeNull();
    expect(data?.work_duration_minutes).toBeGreaterThanOrEqual(0);
  });

  it("rejects a second check-out on the same day", async () => {
    const { error } = await staff.client.rpc("attendance_check_out", {
      p_latitude: HEAD_OFFICE_LAT,
      p_longitude: HEAD_OFFICE_LNG,
      p_photo_url: `integration-test/${staff.userId}/selfie-out2.jpg`,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/already checked out/i);
  });

  it("rejects an unauthenticated check-in", async () => {
    const { anonClient } = await import("../support/supabase-test-client");
    const anon = anonClient();
    const { error } = await anon.rpc("attendance_check_in", {
      p_latitude: HEAD_OFFICE_LAT,
      p_longitude: HEAD_OFFICE_LNG,
      p_photo_url: "should-not-work.jpg",
    });
    expect(error).not.toBeNull();
  });
});
