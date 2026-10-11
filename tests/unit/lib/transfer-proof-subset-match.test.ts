import { describe, expect, it } from "vitest";

import { findMatchingSubsets, pickSubsetMatch } from "@/lib/ai/domains/transfer-proof-confirmation";

const row = (id: string, nominal: number) => ({ id, nominal });

describe("pickSubsetMatch", () => {
  it("prefers the one exact-sum subset over a near-miss within tolerance (Rebecca 529.000 case)", () => {
    const rows = [row("kolam", 400000), row("token", 106000), row("listrik", 300000), row("gas", 123000)];
    const matches = findMatchingSubsets(rows, 529000);
    expect(matches.length).toBe(2); // 106+300+123 exact, 400+123 = 523 within Rp 6.500
    expect(pickSubsetMatch(matches, 529000)?.map((r) => r.id)).toEqual(["token", "listrik", "gas"]);
  });

  it("still refuses to guess between two exact-sum subsets", () => {
    const rows = [row("a", 100000), row("b", 200000), row("c", 150000), row("d", 150000)];
    const matches = findMatchingSubsets(rows, 300000);
    expect(pickSubsetMatch(matches, 300000)).toBeNull();
  });

  it("still refuses to guess between near-misses with no exact sum", () => {
    const rows = [row("a", 100000), row("b", 203000), row("c", 198000)];
    const matches = findMatchingSubsets(rows, 300000);
    expect(matches.length).toBe(2);
    expect(pickSubsetMatch(matches, 300000)).toBeNull();
  });

  it("keeps a single tolerance match as before", () => {
    const rows = [row("a", 1675000), row("b", 1676000), row("c", 9000000)];
    expect(pickSubsetMatch(findMatchingSubsets(rows, 3350000), 3350000)?.map((r) => r.id)).toEqual(["a", "b"]);
  });
});
