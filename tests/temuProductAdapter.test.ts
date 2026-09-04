import { describe, expect, it } from "vitest";

import { TemuProductAdapter } from "../extension/src/adapters/temuProductAdapter";

const productUrl =
  "https://www.temu.com/ca/sample-product-g-123456789.html?is_back=1";

function createAdapter() {
  let nextId = 0;
  return new TemuProductAdapter(() => `test-id-${++nextId}`);
}

describe("TemuProductAdapter", () => {
  it("supports Temu product pages and rejects the homepage", () => {
    const adapter = createAdapter();

    expect(adapter.isSupportedPage(productUrl)).toBe(true);
    expect(adapter.isSupportedPage("https://www.temu.com/?is_back=1")).toBe(false);
  });

  it("extracts the supported ProductInfo fields", () => {
    const document = new DOMParser().parseFromString(
      `
        <main>
          <div class="_25g_jM0z">Ceramic mug</div>
          <div class="_14At0Pe5">7.<span>40</span></div>
          <div class="_14At0Pe5"><span>4.</span><span>58</span></div>
          <div class="_1lS1CJSS PjdWJn3s _28K5UOnx">
            <span class="_14At0Pe5">$0.55</span>
            <span>0.55</span>
          </div>
          <div class="_1lS1CJSS PjdWJn3s"><span>36% OFF</span></div>
        </main>
      `,
      "text/html",
    );
    const adapter = createAdapter();

    const productInfo = adapter.extractProductInfo(document, productUrl);

    expect(productInfo).toEqual({
      name: { id: "test-id-1", value: "Ceramic mug" },
      originalPrice: { id: "test-id-2", value: "7.40" },
      currentPrice: { id: "test-id-3", value: "4.58" },
      discount: { id: "test-id-4", value: "36% OFF" },
    });
  });

  it("omits unavailable optional fields", () => {
    const document = new DOMParser().parseFromString(
      '<div class="_25g_jM0z">Ceramic mug</div>',
      "text/html",
    );
    const adapter = createAdapter();

    expect(adapter.extractProductInfo(document, productUrl)).toEqual({
      name: { id: "test-id-1", value: "Ceramic mug" },
    });
  });

  it("fails when the required name is missing", () => {
    const document = new DOMParser().parseFromString("<main></main>", "text/html");
    const adapter = createAdapter();

    expect(() => adapter.extractProductInfo(document, productUrl)).toThrow(
      "The Temu product name could not be extracted.",
    );
  });

  it("uses product metadata when the detail name class is unavailable", () => {
    const document = new DOMParser().parseFromString(
      '<head><meta property="og:title" content="Portable power bank - Temu Canada"></head>',
      "text/html",
    );
    const adapter = createAdapter();

    expect(adapter.extractProductInfo(document, productUrl).name).toEqual({
      id: "test-id-1",
      value: "Portable power bank",
    });
  });

  it("does not mutate the source document", () => {
    const document = new DOMParser().parseFromString(
      '<div class="_25g_jM0z">Ceramic mug</div>',
      "text/html",
    );
    const before = document.documentElement.outerHTML;
    const adapter = createAdapter();

    adapter.extractProductInfo(document, productUrl);

    expect(document.documentElement.outerHTML).toBe(before);
  });
});
