import { describe, expect, it } from "vitest";

import { neutralizeValuesLocally } from "./localNeutralizer.js";

describe("local neutralizer", () => {
  it("neutralizes canonical ProductInfo fields", () => {
    const legacyOriginalPrice = ["origin", "Prize"].join("");
    const legacyCurrentPrice = ["real", "Prize"].join("");
    const result = neutralizeValuesLocally({
      name: "HOT SALE Wireless Earbuds!",
      originalPrice: "$49.99",
      currentPrice: "$12.99 today only",
      discount: "74% OFF limited time",
      stockAmount: "Only 3 left",
    });

    expect(result).toMatchObject({
      name: "Wireless Earbuds",
      originalPrice: "$49.99",
      currentPrice: "$12.99",
      discount: "74% OFF discount listed",
      stockAmount: "Listed stock quantity: 3",
    });
    expect(result).not.toHaveProperty(legacyOriginalPrice);
    expect(result).not.toHaveProperty(legacyCurrentPrice);
  });
});
