import { describe, expect, it } from "vitest";

import { createEmployeeSchema, updateEmployeeSchema } from "@/features/employees/schemas/employee.schema";

const validCreate = {
  employeeCode: "EMP-0099",
  fullName: "Budi Santoso",
  email: "budi@haluoleo.id",
  branchId: "11111111-1111-1111-1111-111111111111",
  divisionId: null,
  positionId: null,
  roleId: "22222222-2222-2222-2222-222222222222",
  gender: "male" as const,
  joinDate: "2026-01-15",
};

describe("createEmployeeSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(createEmployeeSchema.safeParse(validCreate).success).toBe(true);
  });

  it("rejects a non-UUID branchId", () => {
    expect(createEmployeeSchema.safeParse({ ...validCreate, branchId: "head-office" }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(createEmployeeSchema.safeParse({ ...validCreate, email: "budi@" }).success).toBe(false);
  });

  it("rejects an employee code under 2 characters", () => {
    expect(createEmployeeSchema.safeParse({ ...validCreate, employeeCode: "E" }).success).toBe(false);
  });

  it("rejects an invalid gender value", () => {
    expect(createEmployeeSchema.safeParse({ ...validCreate, gender: "other" }).success).toBe(false);
  });

  it("allows gender to be explicitly null", () => {
    expect(createEmployeeSchema.safeParse({ ...validCreate, gender: null }).success).toBe(true);
  });
});

describe("updateEmployeeSchema", () => {
  const validUpdate = {
    ...validCreate,
    id: "33333333-3333-3333-3333-333333333333",
    employmentStatus: "active" as const,
  };

  it("accepts a valid update payload and drops email from the shape", () => {
    const result = updateEmployeeSchema.safeParse(validUpdate);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid employment status", () => {
    const result = updateEmployeeSchema.safeParse({ ...validUpdate, employmentStatus: "vacation" });
    expect(result.success).toBe(false);
  });

  it("requires a valid UUID id", () => {
    const result = updateEmployeeSchema.safeParse({ ...validUpdate, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("accepts all four employment statuses", () => {
    for (const status of ["active", "inactive", "on_leave", "terminated"] as const) {
      const result = updateEmployeeSchema.safeParse({ ...validUpdate, employmentStatus: status });
      expect(result.success, `status "${status}" should be valid`).toBe(true);
    }
  });
});
