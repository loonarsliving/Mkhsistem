import { describe, expect, it } from "vitest";

import { PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS_SEED } from "@/constants/rbac";

const ALL_PERMISSION_KEYS = new Set(Object.values(PERMISSIONS));
const ALL_ROLE_KEYS = new Set(Object.values(ROLE_KEYS));

describe("RBAC seed integrity", () => {
  it("has a permission list for every declared role, and only for declared roles", () => {
    const seededRoles = Object.keys(ROLE_PERMISSIONS_SEED);
    expect(new Set(seededRoles)).toEqual(ALL_ROLE_KEYS);
  });

  it("only references permission keys that actually exist in PERMISSIONS", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS_SEED)) {
      for (const permission of permissions) {
        expect(ALL_PERMISSION_KEYS.has(permission), `${role} references unknown permission "${permission}"`).toBe(
          true,
        );
      }
    }
  });

  it("has no duplicate permissions within a single role", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS_SEED)) {
      expect(new Set(permissions).size, `${role} has duplicate permission entries`).toBe(permissions.length);
    }
  });

  it("grants super_admin every permission that exists", () => {
    const superAdminPermissions = new Set(ROLE_PERMISSIONS_SEED[ROLE_KEYS.SUPER_ADMIN]);
    for (const permission of ALL_PERMISSION_KEYS) {
      expect(superAdminPermissions.has(permission), `super_admin is missing "${permission}"`).toBe(true);
    }
  });

  it("grants every role at least dashboard.view", () => {
    for (const [role, permissions] of Object.entries(ROLE_PERMISSIONS_SEED)) {
      expect(permissions, `${role} cannot access the dashboard`).toContain(PERMISSIONS.DASHBOARD_VIEW);
    }
  });

  it("scopes staff to view-only, self-service permissions", () => {
    const staffPermissions = new Set(ROLE_PERMISSIONS_SEED[ROLE_KEYS.STAFF]);
    expect(staffPermissions.has(PERMISSIONS.EMPLOYEE_MANAGE)).toBe(false);
    expect(staffPermissions.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(staffPermissions.has(PERMISSIONS.ATTENDANCE_VIEW_OWN)).toBe(true);
  });

  it("does not grant branch-scoped roles company-wide visibility permissions", () => {
    const kepalaCabang = new Set(ROLE_PERMISSIONS_SEED[ROLE_KEYS.KEPALA_CABANG]);
    expect(kepalaCabang.has(PERMISSIONS.ATTENDANCE_VIEW_ALL)).toBe(false);
    expect(kepalaCabang.has(PERMISSIONS.EMPLOYEE_VIEW_ALL)).toBe(false);
  });

  it("kepala_cabang cannot manage org structure, roles, or global settings", () => {
    const kepalaCabang = new Set(ROLE_PERMISSIONS_SEED[ROLE_KEYS.KEPALA_CABANG]);
    for (const forbidden of [
      PERMISSIONS.BRANCH_MANAGE,
      PERMISSIONS.DIVISION_MANAGE,
      PERMISSIONS.POSITION_MANAGE,
      PERMISSIONS.ROLE_MANAGE,
      PERMISSIONS.EMPLOYEE_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE,
    ]) {
      expect(kepalaCabang.has(forbidden), `kepala_cabang should not have "${forbidden}"`).toBe(false);
    }
  });

  it("hr manages people and attendance company-wide but not org structure, roles, or global settings", () => {
    const hr = new Set(ROLE_PERMISSIONS_SEED[ROLE_KEYS.HR]);
    expect(hr.has(PERMISSIONS.EMPLOYEE_VIEW_ALL)).toBe(true);
    expect(hr.has(PERMISSIONS.ATTENDANCE_VIEW_ALL)).toBe(true);
    expect(hr.has(PERMISSIONS.ATTENDANCE_EXPORT)).toBe(true);
    for (const forbidden of [
      PERMISSIONS.BRANCH_MANAGE,
      PERMISSIONS.DIVISION_MANAGE,
      PERMISSIONS.POSITION_MANAGE,
      PERMISSIONS.ROLE_MANAGE,
      PERMISSIONS.SETTINGS_MANAGE,
    ]) {
      expect(hr.has(forbidden), `hr should not have "${forbidden}"`).toBe(false);
    }
  });

  it("direktur_operasional can manage attendance and operational settings but not global settings", () => {
    const direkturOperasional = new Set(ROLE_PERMISSIONS_SEED[ROLE_KEYS.DIREKTUR_OPERASIONAL]);
    expect(direkturOperasional.has(PERMISSIONS.ATTENDANCE_MANAGE)).toBe(true);
    expect(direkturOperasional.has(PERMISSIONS.ATTENDANCE_SETTINGS_MANAGE)).toBe(true);
    expect(direkturOperasional.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
    expect(direkturOperasional.has(PERMISSIONS.ROLE_MANAGE)).toBe(false);
  });
});
