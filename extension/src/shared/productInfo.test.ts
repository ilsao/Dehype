import { describe, expect, it } from "vitest";
import type { NeutralizedProductValues, ProductInfo } from "./productInfo";
import {
  mergeNeutralizedValuesIntoProductInfo,
  toValueOnlyProductInfo,
} from "./productInfo";

describe("ProductInfo AI payload safety", () => {
  it("creates a value-only payload without DOM ids", () => {
    const productInfo: ProductInfo = {
      name: { id: "name-dom-id", value: "Hot Sale Wireless Earbuds!" },
      originPrize: { id: "origin-price-dom-id", value: "$39.99" },
      realPrize: { id: "real-price-dom-id", value: "$9.99 today only" },
      discount: { id: "discount-dom-id", value: "75% OFF - Limited time" },
      image: { id: "image-dom-id", value: "https://example.com/item.jpg" },
      description: { id: "description-dom-id", value: "Must-have viral item" },
      stockAmount: { id: "stock-dom-id", value: "Only 3 left" },
    };

    const valueOnlyPayload = toValueOnlyProductInfo(productInfo);

    expect(valueOnlyPayload).toEqual({
      name: "Hot Sale Wireless Earbuds!",
      originPrize: "$39.99",
      realPrize: "$9.99 today only",
      discount: "75% OFF - Limited time",
      image: "https://example.com/item.jpg",
      description: "Must-have viral item",
      stockAmount: "Only 3 left",
    });
    expect(JSON.stringify(valueOnlyPayload)).not.toContain("dom-id");
  });

  it("merges neutralized values back into ProductInfo while preserving ids", () => {
    const originalProductInfo: ProductInfo = {
      name: { id: "name-id", value: "Hot Sale Wireless Earbuds!" },
      realPrize: { id: "price-id", value: "$9.99 today only" },
      discount: { id: "discount-id", value: "75% OFF - Limited time" },
      description: { id: "description-id", value: "Must-have viral item" },
    };
    const neutralizedValues: NeutralizedProductValues = {
      name: "Wireless Earbuds",
      realPrize: "$9.99",
      discount: "75% discount listed",
      description: "Wireless earbuds with listed product features.",
    };

    const neutralizedProductInfo = mergeNeutralizedValuesIntoProductInfo(
      originalProductInfo,
      neutralizedValues,
    );

    expect(neutralizedProductInfo).toEqual({
      name: { id: "name-id", value: "Wireless Earbuds" },
      realPrize: { id: "price-id", value: "$9.99" },
      discount: { id: "discount-id", value: "75% discount listed" },
      description: {
        id: "description-id",
        value: "Wireless earbuds with listed product features.",
      },
    });
  });

  it("keeps the original value when AI does not return that field", () => {
    const originalProductInfo: ProductInfo = {
      name: { id: "name-id", value: "Wireless Earbuds" },
      stockAmount: { id: "stock-id", value: "Only 3 left" },
    };

    const neutralizedProductInfo = mergeNeutralizedValuesIntoProductInfo(
      originalProductInfo,
      { name: "Wireless Earbuds" },
    );

    expect(neutralizedProductInfo.stockAmount).toEqual({
      id: "stock-id",
      value: "Only 3 left",
    });
  });
});
