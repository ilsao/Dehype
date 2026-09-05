import { describe, expect, it } from "vitest";

import { DEHYPE_ELEMENT_ID } from "../extension/src/adapters/productAdapter";
import {
  TemuProductAdapter,
  parseLocalizedPrice,
} from "../extension/src/adapters/temuProductAdapter";

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
          <div class="_14At0Pe5">$7.<span>40</span></div>
          <div class="_14At0Pe5"><span>$4.</span><span>58</span></div>
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
      originalPrice: { id: "test-id-2", value: "$7.40" },
      currentPrice: { id: "test-id-3", value: "$4.58" },
      discount: { id: "test-id-4", value: "36% OFF" },
    });
  });

  it("assigns the larger price as originalPrice regardless of DOM order", () => {
    const document = new DOMParser().parseFromString(
      `
        <div class="_25g_jM0z">Ceramic mug</div>
        <div class="_14At0Pe5">$4.58</div>
        <div class="_14At0Pe5">$7.40</div>
      `,
      "text/html",
    );
    const adapter = createAdapter();

    expect(adapter.extractProductInfo(document, productUrl)).toEqual({
      name: { id: "test-id-1", value: "Ceramic mug" },
      originalPrice: { id: "test-id-3", value: "$7.40" },
      currentPrice: { id: "test-id-2", value: "$4.58" },
    });
  });

  it("compares only the numeric part of currency-formatted decimal prices", () => {
    const document = new DOMParser().parseFromString(
      `
        <div class="_25g_jM0z">Ceramic mug</div>
        <div class="_14At0Pe5">NT$ 4.58</div>
        <div class="_14At0Pe5">NT$ 1,007.40</div>
      `,
      "text/html",
    );
    const adapter = createAdapter();

    expect(adapter.extractProductInfo(document, productUrl)).toEqual({
      name: { id: "test-id-1", value: "Ceramic mug" },
      originalPrice: { id: "test-id-3", value: "NT$ 1,007.40" },
      currentPrice: { id: "test-id-2", value: "NT$ 4.58" },
    });
  });

  it("assigns a single price as currentPrice", () => {
    const document = new DOMParser().parseFromString(
      `
        <div class="_25g_jM0z">Ceramic mug</div>
        <div class="_14At0Pe5">$4.58</div>
      `,
      "text/html",
    );
    const adapter = createAdapter();

    expect(adapter.extractProductInfo(document, productUrl)).toEqual({
      name: { id: "test-id-1", value: "Ceramic mug" },
      currentPrice: { id: "test-id-2", value: "$4.58" },
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

  it("extracts optional facts and uses metadata fallbacks", () => {
    const document = new DOMParser().parseFromString(
      `
        <head>
          <meta property="og:image" content="https://example.test/mug.png">
          <meta name="description" content="A 350 ml ceramic mug">
        </head>
        <main>
          <h1 data-testid="product-title">Ceramic mug</h1>
          <span data-testid="current-price">NT$429</span>
          <span data-testid="stock-status">12 items available</span>
        </main>
      `,
      "text/html",
    );

    expect(createAdapter().extractProductInfo(document, productUrl)).toEqual({
      name: { id: "test-id-1", value: "Ceramic mug" },
      currentPrice: { id: "test-id-2", value: "NT$429" },
      image: { id: "test-id-3", value: "https://example.test/mug.png" },
      description: { id: "test-id-4", value: "A 350 ml ceramic mug" },
      stockAmount: { id: "test-id-5", value: "12 items available" },
    });
  });

  it("normalizes common localized price formats for comparison", () => {
    expect(parseLocalizedPrice("NT$ 1,299")).toBe(1299);
    expect(parseLocalizedPrice("€ 1.299,95")).toBe(1299.95);
    expect(parseLocalizedPrice("US$ 1,299.95")).toBe(1299.95);
    expect(parseLocalizedPrice("CHF 1’299.50")).toBe(1299.5);
    expect(parseLocalizedPrice("Price unavailable")).toBeUndefined();
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

  it("marks extracted elements so neutralized values can be written back", () => {
    const document = new DOMParser().parseFromString(
      '<div class="_25g_jM0z">Ceramic mug</div>',
      "text/html",
    );
    const adapter = new TemuProductAdapter();

    const productInfo = adapter.extractProductInfo(document, productUrl);

    expect(
      document.querySelector("._25g_jM0z")?.getAttribute(DEHYPE_ELEMENT_ID),
    ).toBe(productInfo.name.id);
  });

  it("finds known promotional elements without selecting commerce controls", () => {
    const document = new DOMParser().parseFromString(
      `
        <main>
          <h1 class="_25g_jM0z">Ceramic mug</h1>
          <div data-testid="countdown-banner">Flash sale 01:00:00</div>
          <aside data-dehype-persuasion>Spin to win</aside>
          <section>Limited time <button>Add to cart</button></section>
          <button data-testid="coupon-button">Apply coupon</button>
        </main>
      `,
      "text/html",
    );
    const adapter = new TemuProductAdapter();
    adapter.extractProductInfo(document, productUrl);

    expect(
      adapter.findSuppressibleElements(document).map((element) => element.textContent),
    ).toEqual(expect.arrayContaining(["Flash sale 01:00:00", "Spin to win"]));
    expect(adapter.findSuppressibleElements(document)).not.toContain(
      document.querySelector("section"),
    );
    expect(adapter.findSuppressibleElements(document)).not.toContain(
      document.querySelector("button"),
    );
  });
});
