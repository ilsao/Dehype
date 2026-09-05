import { describe, expect, it } from "vitest";

import {
  createPriceBins,
  isBinInBudget,
  parsePrice,
  selectRandomProducts,
  summarizePrices,
} from "./priceComparison";

describe("price comparison helpers", () => {
  it("parses Temu currency strings without estimating prices", () => {
    expect(parsePrice("$3.50 CAD")).toEqual({
      priceStr: "$3.50 CAD",
      price: 3.5,
      currency: "CAD",
    });
    expect(parsePrice("not a price")).toBeUndefined();
  });

  it("randomly selects no more than the configured maximum", () => {
    expect(selectRandomProducts([1, 2, 3], 2, () => 0)).toHaveLength(2);
  });

  it("calculates min, max, and median", () => {
    expect(summarizePrices([42, 3, 10, 20])).toEqual({
      min: 3,
      max: 42,
      median: 15,
    });
  });

  it("groups prices into histogram bins", () => {
    const bins = createPriceBins([1, 2, 3, 4, 5, 6], 3);
    expect(bins).toHaveLength(3);
    expect(bins.map(({ count }) => count)).toEqual([2, 2, 2]);
    expect(bins[0]?.lower).toBe(1);
    expect(bins[2]?.upper).toBe(6);
    expect(bins[1]?.lower).toBeCloseTo(bins[0]?.upper ?? 0);
    expect(bins[2]?.lower).toBeCloseTo(bins[1]?.upper ?? 0);
  });

  it("checks if a bin is within the budget range", () => {
    const bin = { lower: 5, upper: 10, count: 3 };

    // Neither set -> false
    expect(isBinInBudget(bin, null, null)).toBe(false);

    // Overlapping ranges
    expect(isBinInBudget(bin, 3, 7)).toBe(true);
    expect(isBinInBudget(bin, 6, 8)).toBe(true);
    expect(isBinInBudget(bin, 8, 12)).toBe(true);
    expect(isBinInBudget(bin, 2, 15)).toBe(true);

    // Non-overlapping ranges
    expect(isBinInBudget(bin, 1, 4)).toBe(false);
    expect(isBinInBudget(bin, 12, 20)).toBe(false);

    // Min only
    expect(isBinInBudget(bin, 8, null)).toBe(true);
    expect(isBinInBudget(bin, 11, null)).toBe(false);

    // Max only
    expect(isBinInBudget(bin, null, 6)).toBe(true);
    expect(isBinInBudget(bin, null, 4)).toBe(false);
  });
});