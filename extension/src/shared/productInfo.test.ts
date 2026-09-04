import { describe, expect, expectTypeOf, it } from "vitest";

import type { Elem, ProductInfo } from "./productInfo";

describe("ProductInfo contract", () => {
  it("accepts a product with only its required name", () => {
    const product: ProductInfo = {
      name: { id: "product-name", value: "Neutral product" },
    };

    expect(product.name.value).toBe("Neutral product");
    expectTypeOf(product).toMatchTypeOf<{ name: Elem }>();
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
      Elem | undefined
    >();
  });

  it("requires string values for extracted elements", () => {
    expectTypeOf<Elem["id"]>().toEqualTypeOf<string>();
    expectTypeOf<Elem["value"]>().toEqualTypeOf<string>();
    expectTypeOf<Record<string, never>>().not.toMatchTypeOf<ProductInfo>();
  });
});
