import { describe, expect, it } from "vitest";

import {
  issueWarningSchema,
  revokeActionSchema,
  terminateEmployeeSchema,
} from "@/features/hr-discipline/schemas/hr-discipline.schema";

const EMPLOYEE_ID = "11111111-2222-3333-4444-555555555555";

describe("issueWarningSchema", () => {
  it("accepts a complete warning", () => {
    const result = issueWarningSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      actionType: "sp1",
      reasonCategory: "attendance",
      description: "Alpha tiga hari berturut-turut tanpa keterangan.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a description too short to be a record of anything", () => {
    const result = issueWarningSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      actionType: "sp1",
      reasonCategory: "attendance",
      description: "malas",
    });
    expect(result.success).toBe(false);
  });

  it("rejects termination — that path must go through terminateEmployeeSchema", () => {
    const result = issueWarningSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      actionType: "termination",
      reasonCategory: "conduct",
      description: "Uraian yang cukup panjang untuk lolos validasi.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown reason category", () => {
    const result = issueWarningSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      actionType: "sp2",
      reasonCategory: "mood",
      description: "Uraian yang cukup panjang untuk lolos validasi.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-uuid employee id", () => {
    const result = issueWarningSchema.safeParse({
      employeeId: "not-a-uuid",
      actionType: "sp1",
      reasonCategory: "conduct",
      description: "Uraian yang cukup panjang untuk lolos validasi.",
    });
    expect(result.success).toBe(false);
  });
});

describe("terminateEmployeeSchema", () => {
  it("accepts a termination without the optional fields", () => {
    const result = terminateEmployeeSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      reasonCategory: "conduct",
      description: "Pelanggaran berat sesuai berita acara terlampir.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty last working date (the RPC defaults it to today)", () => {
    const result = terminateEmployeeSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      reasonCategory: "conduct",
      description: "Pelanggaran berat sesuai berita acara terlampir.",
      lastWorkingDate: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed last working date", () => {
    const result = terminateEmployeeSchema.safeParse({
      employeeId: EMPLOYEE_ID,
      reasonCategory: "conduct",
      description: "Pelanggaran berat sesuai berita acara terlampir.",
      lastWorkingDate: "31-12-2026",
    });
    expect(result.success).toBe(false);
  });
});

describe("revokeActionSchema", () => {
  it("requires a reason", () => {
    expect(revokeActionSchema.safeParse({ id: EMPLOYEE_ID, reason: "" }).success).toBe(false);
    expect(revokeActionSchema.safeParse({ id: EMPLOYEE_ID, reason: "Banding diterima" }).success).toBe(true);
  });
});
