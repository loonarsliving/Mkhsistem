import { describe, expect, it } from "vitest";

import { decideCampaignAction, type DecisionEngineInput } from "@/lib/occupancy/decision-engine";

function baseInput(overrides: Partial<DecisionEngineInput> = {}): DecisionEngineInput {
  return {
    currentClassification: "LOW",
    minAvailableUnits: 5,
    insights: { spendIdr: 100_000, clicks: 50, ctrPercent: 2.5 },
    previousInsights: null,
    ...overrides,
  };
}

describe("decideCampaignAction", () => {
  it("PAUSEs when occupancy is now HIGH, regardless of performance", () => {
    const result = decideCampaignAction(baseInput({ currentClassification: "HIGH" }));
    expect(result.decision).toBe("PAUSE");
    expect(result.reasoning.join(" ")).toMatch(/HIGH/);
  });

  it("PAUSEs when occupancy is now FULL", () => {
    const result = decideCampaignAction(baseInput({ currentClassification: "FULL" }));
    expect(result.decision).toBe("PAUSE");
  });

  it("PAUSE takes priority over thin inventory or bad CTR", () => {
    const result = decideCampaignAction(baseInput({ currentClassification: "FULL", minAvailableUnits: 0, insights: { spendIdr: 1, clicks: 1, ctrPercent: 0 } }));
    expect(result.decision).toBe("PAUSE");
  });

  it("REDUCEs when inventory is thin (at/below the threshold)", () => {
    const result = decideCampaignAction(baseInput({ minAvailableUnits: 1 }));
    expect(result.decision).toBe("REDUCE");
    expect(result.reasoning.join(" ")).toMatch(/tipis/);
  });

  it("REDUCEs when CPC worsens by more than the threshold fraction vs. the previous check", () => {
    const result = decideCampaignAction(
      baseInput({
        insights: { spendIdr: 200_000, clicks: 50, ctrPercent: 2.5 }, // cpc = 4000
        previousInsights: { spendIdr: 100_000, clicks: 50, ctrPercent: 2.5 }, // cpc = 2000, +100%
      }),
    );
    expect(result.decision).toBe("REDUCE");
    expect(result.cpcIdr).toBe(4000);
    expect(result.previousCpcIdr).toBe(2000);
  });

  it("does NOT reduce for a small CPC increase under the worsening threshold", () => {
    const result = decideCampaignAction(
      baseInput({
        insights: { spendIdr: 105_000, clicks: 50, ctrPercent: 2.5 }, // cpc = 2100
        previousInsights: { spendIdr: 100_000, clicks: 50, ctrPercent: 2.5 }, // cpc = 2000, +5%
      }),
    );
    expect(result.decision).not.toBe("REDUCE");
  });

  it("SCALEs when still LOW and CTR is at/above the healthy floor", () => {
    const result = decideCampaignAction(baseInput({ currentClassification: "LOW", insights: { spendIdr: 100_000, clicks: 50, ctrPercent: 3 } }));
    expect(result.decision).toBe("SCALE");
  });

  it("MAINTAINs when still LOW but CTR is below the healthy floor (no reduce trigger either)", () => {
    const result = decideCampaignAction(baseInput({ currentClassification: "LOW", insights: { spendIdr: 100_000, clicks: 50, ctrPercent: 0.2 } }));
    expect(result.decision).toBe("MAINTAIN");
  });

  it("MAINTAINs when HEALTHY with no urgent problem", () => {
    const result = decideCampaignAction(baseInput({ currentClassification: "HEALTHY" }));
    expect(result.decision).toBe("MAINTAIN");
  });

  it("computes cpcIdr as 0 when there are no clicks yet (never divides by zero)", () => {
    const result = decideCampaignAction(baseInput({ insights: { spendIdr: 50_000, clicks: 0, ctrPercent: 0 } }));
    expect(result.cpcIdr).toBe(0);
  });

  it("treats a missing previous snapshot as no trend data (never fabricates a 'worsened' claim)", () => {
    const result = decideCampaignAction(baseInput({ previousInsights: null, minAvailableUnits: 10, insights: { spendIdr: 1_000_000, clicks: 2, ctrPercent: 3 } }));
    expect(result.previousCpcIdr).toBeNull();
    expect(result.decision).toBe("SCALE");
  });
});
