import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { requireCronAuth } from "@/lib/security/cron-auth";

function req(headers: Record<string, string> = {}) {
  return new Request("https://mkh.haluoleo.id/api/crm/dispatch-promo-sends", {
    method: "POST",
    headers,
  });
}

const ORIGINAL = process.env.CRON_SECRET;

beforeEach(() => {
  // The logger writes a structured line per rejection; keep test output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL;
  vi.restoreAllMocks();
});

describe("requireCronAuth", () => {
  it("fails open when CRON_SECRET is unset, so the rollout needs no outage window", () => {
    delete process.env.CRON_SECRET;
    expect(requireCronAuth(req())).toBeNull();
    expect(requireCronAuth(req({ "x-cron-secret": "anything" }))).toBeNull();
  });

  it("treats an empty CRON_SECRET the same as unset", () => {
    process.env.CRON_SECRET = "";
    expect(requireCronAuth(req())).toBeNull();
  });

  it("allows a request whose header matches the configured secret", () => {
    process.env.CRON_SECRET = "s3cr3t-value";
    expect(requireCronAuth(req({ "x-cron-secret": "s3cr3t-value" }))).toBeNull();
  });

  it("rejects a missing header once the secret is configured", async () => {
    process.env.CRON_SECRET = "s3cr3t-value";
    const res = requireCronAuth(req());
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    await expect(res!.json()).resolves.toEqual({ status: "error", error: "unauthorized" });
  });

  it("rejects a wrong secret", () => {
    process.env.CRON_SECRET = "s3cr3t-value";
    expect(requireCronAuth(req({ "x-cron-secret": "wrong" }))?.status).toBe(401);
  });

  it("rejects a secret of the same length but different content", () => {
    process.env.CRON_SECRET = "aaaaaaaaaaaa";
    expect(requireCronAuth(req({ "x-cron-secret": "aaaaaaaaaaab" }))?.status).toBe(401);
  });

  it("rejects a prefix of the real secret rather than accepting it", () => {
    process.env.CRON_SECRET = "s3cr3t-value";
    expect(requireCronAuth(req({ "x-cron-secret": "s3cr3t" }))?.status).toBe(401);
  });
});
