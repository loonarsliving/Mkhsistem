import { describe, expect, it } from "vitest";

import {
  checkInSchema,
  decideLeaveRequestSchema,
  leaveRequestSchema,
  workScheduleSchema,
} from "@/features/attendance/schemas/attendance.schema";

describe("checkInSchema", () => {
  it("accepts a valid check-in payload", () => {
    const result = checkInSchema.safeParse({
      latitude: -3.9778,
      longitude: 122.5194,
      photoUrl: "attendance-selfies/user-id/selfie.jpg",
      note: "On time",
    });
    expect(result.success).toBe(true);
  });

  it("requires a photo to have been captured", () => {
    const result = checkInSchema.safeParse({ latitude: -3.9778, longitude: 122.5194, photoUrl: "" });
    expect(result.success).toBe(false);
  });

  it("rejects non-numeric coordinates", () => {
    const result = checkInSchema.safeParse({ latitude: "north", longitude: 122.5194, photoUrl: "x.jpg" });
    expect(result.success).toBe(false);
  });

  it("caps the note at 500 characters", () => {
    const result = checkInSchema.safeParse({
      latitude: 0,
      longitude: 0,
      photoUrl: "x.jpg",
      note: "a".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("leaveRequestSchema", () => {
  it("accepts a valid izin request", () => {
    const result = leaveRequestSchema.safeParse({
      type: "izin",
      startDate: "2026-08-01",
      endDate: "2026-08-02",
      reason: "Acara keluarga",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = leaveRequestSchema.safeParse({
      type: "sakit",
      startDate: "2026-08-05",
      endDate: "2026-08-01",
      reason: "Demam tinggi",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["endDate"]);
    }
  });

  it("rejects a reason shorter than 5 characters", () => {
    const result = leaveRequestSchema.safeParse({
      type: "izin",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      reason: "sakit",
    });
    // "sakit" is exactly 5 chars, boundary case should pass
    expect(result.success).toBe(true);

    const tooShort = leaveRequestSchema.safeParse({
      type: "izin",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      reason: "abcd",
    });
    expect(tooShort.success).toBe(false);
  });

  it("rejects an invalid leave type", () => {
    const result = leaveRequestSchema.safeParse({
      type: "cuti",
      startDate: "2026-08-01",
      endDate: "2026-08-01",
      reason: "Alasan valid",
    });
    expect(result.success).toBe(false);
  });
});

describe("decideLeaveRequestSchema", () => {
  it("requires a valid UUID for the leave request id", () => {
    const result = decideLeaveRequestSchema.safeParse({ leaveRequestId: "not-a-uuid", approve: true });
    expect(result.success).toBe(false);
  });

  it("accepts a valid approval decision", () => {
    const result = decideLeaveRequestSchema.safeParse({
      leaveRequestId: "11111111-1111-1111-1111-111111111111",
      approve: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("workScheduleSchema", () => {
  const base = {
    branchId: null,
    name: "Jam Kerja Standar",
    startTime: "08:00",
    endTime: "17:00",
    lateToleranceMinutes: 15,
    workDays: [1, 2, 3, 4, 5],
    isDefault: true,
  };

  it("accepts a valid schedule", () => {
    expect(workScheduleSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a malformed time string", () => {
    expect(workScheduleSchema.safeParse({ ...base, startTime: "8am" }).success).toBe(false);
  });

  it("requires at least one work day", () => {
    expect(workScheduleSchema.safeParse({ ...base, workDays: [] }).success).toBe(false);
  });

  it("rejects a late tolerance above the 180 minute cap", () => {
    expect(workScheduleSchema.safeParse({ ...base, lateToleranceMinutes: 181 }).success).toBe(false);
  });

  it("coerces numeric strings for lateToleranceMinutes (form input)", () => {
    const result = workScheduleSchema.safeParse({ ...base, lateToleranceMinutes: "20" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.lateToleranceMinutes).toBe(20);
    }
  });
});
