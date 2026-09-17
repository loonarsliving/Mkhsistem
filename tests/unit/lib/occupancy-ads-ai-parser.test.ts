import { describe, expect, it } from "vitest";

import { parseOccupancyAdsBriefJson, resolveLaunchBudgetIdr } from "@/lib/ai/domains/occupancy-ads";

const validResponse = {
  campaign_objective: "last_minute_gap_fill",
  target_dates: ["2026-10-05", "2026-10-06"],
  target_market: "Yogyakarta",
  audience_persona: "weekend_couple_getaway",
  creative_angle: "Quality time singkat tanpa jauh-jauh",
  offer: "Diskon 10% untuk booking minggu ini",
  recommended_budget: 300000,
  duration: 5,
  primary_text: "Weekend santai di villa asri, cocok buat kamu dan pasangan.",
  headline: "Villa Asri, Weekend Santai",
  description: "Booking sekarang, slot terbatas.",
  cta: "Pesan Sekarang",
  destination_url: "https://loonars.id",
  selected_assets: ["asset-1"],
  reasoning: "Okupansi akhir pekan ini rendah, target pasangan muda Jogja paling relevan.",
  confidence: "medium",
};

describe("parseOccupancyAdsBriefJson", () => {
  it("parses a well-formed JSON response", () => {
    const brief = parseOccupancyAdsBriefJson(JSON.stringify(validResponse));
    expect(brief.campaignObjective).toBe("last_minute_gap_fill");
    expect(brief.targetDates).toEqual(["2026-10-05", "2026-10-06"]);
    expect(brief.targetMarket).toBe("Yogyakarta");
    expect(brief.audiencePersona).toBe("weekend_couple_getaway");
    expect(brief.recommendedDailyBudgetIdrRaw).toBe(300000);
    expect(brief.destinationUrl).toBe("https://loonars.id");
    expect(brief.selectedAssetIds).toEqual(["asset-1"]);
  });

  it("strips a markdown code fence before parsing", () => {
    const fenced = "```json\n" + JSON.stringify(validResponse) + "\n```";
    const brief = parseOccupancyAdsBriefJson(fenced);
    expect(brief.headline).toBe("Villa Asri, Weekend Santai");
  });

  it("throws on an invalid campaign_objective outside the fixed candidate set", () => {
    const bad = { ...validResponse, campaign_objective: "made_up_objective" };
    expect(() => parseOccupancyAdsBriefJson(JSON.stringify(bad))).toThrow(/campaign_objective/);
  });

  it("throws on a target_market outside the fixed candidate set (never lets the AI invent a market)", () => {
    const bad = { ...validResponse, target_market: "Atlantis" };
    expect(() => parseOccupancyAdsBriefJson(JSON.stringify(bad))).toThrow(/target_market/);
  });

  it("throws on an audience_persona outside the fixed candidate set", () => {
    const bad = { ...validResponse, audience_persona: "made_up_persona" };
    expect(() => parseOccupancyAdsBriefJson(JSON.stringify(bad))).toThrow(/audience_persona/);
  });

  it("throws when target_dates is missing/empty", () => {
    const bad = { ...validResponse, target_dates: [] };
    expect(() => parseOccupancyAdsBriefJson(JSON.stringify(bad))).toThrow(/target_dates/);
  });

  it("throws when headline is missing", () => {
    const bad = { ...validResponse, headline: "" };
    expect(() => parseOccupancyAdsBriefJson(JSON.stringify(bad))).toThrow(/headline/);
  });

  it("falls back destination_url to the fixed origin when the model omits/mangles it", () => {
    const bad = { ...validResponse, destination_url: "https://not-loonars.example.com" };
    const brief = parseOccupancyAdsBriefJson(JSON.stringify(bad));
    expect(brief.destinationUrl).toBe("https://loonars.id");
  });

  it("throws on malformed (non-JSON) text", () => {
    expect(() => parseOccupancyAdsBriefJson("not json at all")).toThrow();
  });

  it("throws on a truncated/incomplete JSON response", () => {
    expect(() => parseOccupancyAdsBriefJson('{"campaign_objective": "last_minute_gap_fill",')).toThrow();
  });

  it("defaults confidence to medium when absent/invalid", () => {
    const bad = { ...validResponse, confidence: "extremely_sure" };
    const brief = parseOccupancyAdsBriefJson(JSON.stringify(bad));
    expect(brief.confidence).toBe("medium");
  });
});

describe("resolveLaunchBudgetIdr", () => {
  it("clamps the brief's raw AI budget suggestion to the admin ceiling", () => {
    expect(resolveLaunchBudgetIdr({ recommendedDailyBudgetIdrRaw: 900_000 }, 300_000)).toBe(300_000);
    expect(resolveLaunchBudgetIdr({ recommendedDailyBudgetIdrRaw: 100_000 }, 300_000)).toBe(100_000);
  });
});
