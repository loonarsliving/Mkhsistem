import { describe, expect, it } from "vitest";

import { clampToBudgetCeiling, isAllowedOccupancyDestinationUrl } from "@/lib/occupancy/campaign-rules";

describe("isAllowedOccupancyDestinationUrl", () => {
  it("allows the bare loonars.id origin", () => {
    expect(isAllowedOccupancyDestinationUrl("https://loonars.id")).toBe(true);
  });

  it("allows a page under loonars.id", () => {
    expect(isAllowedOccupancyDestinationUrl("https://loonars.id/booking?ref=ads")).toBe(true);
  });

  it("refuses a different host entirely", () => {
    expect(isAllowedOccupancyDestinationUrl("https://evil.example.com")).toBe(false);
  });

  it("refuses a lookalike host (loonars.id.evil.com)", () => {
    expect(isAllowedOccupancyDestinationUrl("https://loonars.id.evil.com")).toBe(false);
  });

  it("refuses a subdomain not explicitly allowed", () => {
    expect(isAllowedOccupancyDestinationUrl("https://sub.loonars.id")).toBe(false);
  });

  it("refuses a non-https scheme", () => {
    expect(isAllowedOccupancyDestinationUrl("http://loonars.id")).toBe(false);
  });

  it("refuses garbage/unparseable input", () => {
    expect(isAllowedOccupancyDestinationUrl("not a url")).toBe(false);
    expect(isAllowedOccupancyDestinationUrl("")).toBe(false);
  });
});

describe("clampToBudgetCeiling", () => {
  it("passes a value through unchanged when under the ceiling", () => {
    expect(clampToBudgetCeiling(100_000, 500_000)).toBe(100_000);
  });

  it("clamps a value that exceeds the ceiling", () => {
    expect(clampToBudgetCeiling(900_000, 500_000)).toBe(500_000);
  });

  it("fails closed (0) when the ceiling is not configured", () => {
    expect(clampToBudgetCeiling(100_000, 0)).toBe(0);
    expect(clampToBudgetCeiling(100_000, -1)).toBe(0);
  });

  it("fails closed (0) for a negative or non-finite recommended budget", () => {
    expect(clampToBudgetCeiling(-1, 500_000)).toBe(0);
    expect(clampToBudgetCeiling(NaN, 500_000)).toBe(0);
  });
});
