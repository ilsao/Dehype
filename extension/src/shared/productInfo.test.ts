import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  NeutralizeProductValuesRequest,
  NeutralizedProductValues,
  ProductElement,
  ProductInfo,
} from "./productInfo";
import {
  isContentScriptRequest,
  isNeutralizeProductValuesResponse,
  isNeutralizeProductValuesRequest,
  isRebuildCurrentProductResponse,
  mergeNeutralizedValuesIntoProductInfo,
  toValueOnlyProductInfo,
} from "./productInfo";

describe("ProductInfo contract", () => {
  it("accepts a product with only its required name", () => {
    const product: ProductInfo = {
      name: { id: "product-name", value: "Neutral product" },
    };

    expect(product.name.value).toBe("Neutral product");
    expectTypeOf(product).toMatchTypeOf<{ name: ProductElement }>();
  });

  it("keeps extracted details optional", () => {
    const product: ProductInfo = {
      name: { id: "product-name", value: "Neutral product" },
      originalPrice: { id: "original-price", value: "NT$1,000" },
      currentPrice: { id: "current-price", value: "NT$800" },
      discount: { id: "discount", value: "20% off" },
      image: { id: "image", value: "https://example.invalid/product.png" },
      description: { id: "description", value: "Product description" },
      stockAmount: { id: "stock", value: "Unknown" },
    };

    expect(product.currentPrice?.value).toBe("NT$800");
    expectTypeOf<ProductInfo["originalPrice"]>().toEqualTypeOf<
      ProductElement | undefined
    >();
  });

  it("requires string values for extracted elements", () => {
    expectTypeOf<ProductElement["id"]>().toEqualTypeOf<string>();
    expectTypeOf<ProductElement["value"]>().toEqualTypeOf<string>();
    expectTypeOf<Record<string, never>>().not.toMatchTypeOf<ProductInfo>();
  });
});

describe("extension message boundaries", () => {
  it("accepts only valid value-only analysis requests", () => {
    expect(
      isNeutralizeProductValuesRequest({
        type: "DEHYPE_NEUTRALIZE_VALUES",
        productValues: { name: "Product", currentPrice: "NT$429" },
      }),
    ).toBe(true);
    expect(
      isNeutralizeProductValuesRequest({
        type: "DEHYPE_NEUTRALIZE_VALUES",
        productValues: { name: "Product", id: "dom-node" },
      }),
    ).toBe(false);
  });

  it("validates content requests and typed rebuild responses", () => {
    expect(
      isContentScriptRequest({ type: "DEHYPE_RESTORE_CURRENT_PRODUCT" }),
    ).toBe(true);
    expect(
      isRebuildCurrentProductResponse({
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT",
        productInfo: { name: { id: "name", value: "Product" } },
        source: "structural",
        appliedFields: ["name"],
        suppressedElementCount: 0,
        deemphasizedElementCount: 0,
      }),
    ).toBe(true);
    expect(
      isRebuildCurrentProductResponse({
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT",
        productInfo: { name: { id: "", value: "Product" } },
        source: "unknown",
        appliedFields: [],
        suppressedElementCount: -1,
        deemphasizedElementCount: -1,
      }),
    ).toBe(false);

    expect(
      isRebuildCurrentProductResponse({
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT",
        productInfo: { name: { id: "name", value: "Product" } },
        source: "structural",
        appliedFields: [],
        suppressedElementCount: 0,
        deemphasizedElementCount: 0,
      }),
    ).toBe(false);
  });

  it("allows a model to return only the fields it could neutralize", () => {
    expect(
      isNeutralizeProductValuesResponse({
        type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
        productValues: { discount: "20% discount listed" },
        source: "model",
      }),
    ).toBe(true);
  });
});

describe("Hype2.md ProductInfo requirement", () => {
  it("sends only field values from the documented ProductInfo shape to AI", () => {
    const productInfo: ProductInfo = {
      name: { id: "name-dom-node", value: "HOT SALE Wireless Earbuds!" },
      originalPrice: { id: "original-price-dom-node", value: "$49.99" },
      currentPrice: { id: "current-price-dom-node", value: "$12.99 today only" },
      discount: { id: "discount-dom-node", value: "74% OFF limited time" },
      image: {
        id: "image-dom-node",
        value: "https://example.invalid/earbuds.png",
      },
      description: {
        id: "description-dom-node",
        value: "Must-have viral earbuds with flash sale bonus",
      },
      stockAmount: { id: "stock-dom-node", value: "Only 3 left" },
    };

    const requestForAi: NeutralizeProductValuesRequest = {
      type: "DEHYPE_NEUTRALIZE_VALUES",
      productValues: toValueOnlyProductInfo(productInfo),
    };

    expect(requestForAi.productValues).toEqual({
      name: "HOT SALE Wireless Earbuds!",
      originalPrice: "$49.99",
      currentPrice: "$12.99 today only",
      discount: "74% OFF limited time",
      image: "https://example.invalid/earbuds.png",
      description: "Must-have viral earbuds with flash sale bonus",
      stockAmount: "Only 3 left",
    });
    expect(Object.keys(requestForAi.productValues)).toEqual([
      "name",
      "originalPrice",
      "currentPrice",
      "discount",
      "image",
      "description",
      "stockAmount",
    ]);
    expect(Object.values(requestForAi.productValues)).toSatisfy(
      (values: unknown[]) => values.every((value) => typeof value === "string"),
    );
    expect(JSON.stringify(requestForAi.productValues)).not.toContain("dom-node");
    expect(JSON.stringify(requestForAi.productValues)).not.toContain('"id"');
  });

  it("applies neutralized AI values back to the same local elements", () => {
    const originalProductInfo: ProductInfo = {
      name: { id: "name-dom-node", value: "HOT SALE Wireless Earbuds!" },
      currentPrice: { id: "current-price-dom-node", value: "$12.99 today only" },
      discount: { id: "discount-dom-node", value: "74% OFF limited time" },
      description: {
        id: "description-dom-node",
        value: "Must-have viral earbuds with flash sale bonus",
      },
      stockAmount: { id: "stock-dom-node", value: "Only 3 left" },
    };
    const neutralizedValues: NeutralizedProductValues = {
      name: "Wireless Earbuds",
      currentPrice: "$12.99",
      discount: "74% discount listed",
      description: "Wireless earbuds with listed product details.",
      stockAmount: "Listed stock quantity: 3",
    };

    const neutralizedProductInfo = mergeNeutralizedValuesIntoProductInfo(
      originalProductInfo,
      neutralizedValues,
    );

    expect(neutralizedProductInfo).toEqual({
      name: { id: "name-dom-node", value: "Wireless Earbuds" },
      currentPrice: { id: "current-price-dom-node", value: "$12.99" },
      discount: { id: "discount-dom-node", value: "74% discount listed" },
      description: {
        id: "description-dom-node",
        value: "Wireless earbuds with listed product details.",
      },
      stockAmount: {
        id: "stock-dom-node",
        value: "Listed stock quantity: 3",
      },
    });
  });
});

describe("ProductInfo AI payload safety", () => {
  it("builds an AI request from ProductInfo values without element ids", () => {
    const productInfo: ProductInfo = {
      name: { id: "name-element", value: "Flash Deal Phone Case!" },
      originalPrice: { id: "original-price-element", value: "$24.99" },
      currentPrice: { id: "current-price-element", value: "$8.99" },
      discount: { id: "discount-element", value: "64% OFF today only" },
      image: { id: "image-element", value: "https://example.invalid/case.png" },
      description: {
        id: "description-element",
        value: "Trending must-have phone case",
      },
      stockAmount: { id: "stock-element", value: "Only 2 left" },
    };

    const request: NeutralizeProductValuesRequest = {
      type: "DEHYPE_NEUTRALIZE_VALUES",
      productValues: toValueOnlyProductInfo(productInfo),
    };

    expect(request).toEqual({
      type: "DEHYPE_NEUTRALIZE_VALUES",
      productValues: {
        name: "Flash Deal Phone Case!",
        originalPrice: "$24.99",
        currentPrice: "$8.99",
        discount: "64% OFF today only",
        image: "https://example.invalid/case.png",
        description: "Trending must-have phone case",
        stockAmount: "Only 2 left",
      },
    });
    expect(JSON.stringify(request.productValues)).not.toContain("element");
    expect(Object.values(request.productValues)).toSatisfy((values: unknown[]) =>
      values.every((value) => typeof value === "string"),
    );
  });

  it("creates a value-only payload without DOM ids", () => {
    const productInfo: ProductInfo = {
      name: { id: "name-dom-id", value: "Hot Sale Wireless Earbuds!" },
      originalPrice: { id: "original-price-dom-id", value: "$39.99" },
      currentPrice: { id: "current-price-dom-id", value: "$9.99 today only" },
      discount: { id: "discount-dom-id", value: "75% OFF - Limited time" },
      image: { id: "image-dom-id", value: "https://example.com/item.jpg" },
      description: { id: "description-dom-id", value: "Must-have viral item" },
      stockAmount: { id: "stock-dom-id", value: "Only 3 left" },
    };

    const valueOnlyPayload = toValueOnlyProductInfo(productInfo);

    expect(valueOnlyPayload).toEqual({
      name: "Hot Sale Wireless Earbuds!",
      originalPrice: "$39.99",
      currentPrice: "$9.99 today only",
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
      currentPrice: { id: "price-id", value: "$9.99 today only" },
      discount: { id: "discount-id", value: "75% OFF - Limited time" },
      description: { id: "description-id", value: "Must-have viral item" },
    };
    const neutralizedValues: NeutralizedProductValues = {
      name: "Wireless Earbuds",
      currentPrice: "$9.99",
      discount: "75% discount listed",
      description: "Wireless earbuds with listed product features.",
    };

    const neutralizedProductInfo = mergeNeutralizedValuesIntoProductInfo(
      originalProductInfo,
      neutralizedValues,
    );

    expect(neutralizedProductInfo).toEqual({
      name: { id: "name-id", value: "Wireless Earbuds" },
      currentPrice: { id: "price-id", value: "$9.99" },
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
