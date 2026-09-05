import { describe, expect, it } from "vitest";

import { TemuSearchAdapter } from "../extension/src/adapters/temuSearchAdapter";

describe("TemuSearchAdapter", () => {
  it("builds a locale-aware search URL", () => {
    const adapter = new TemuSearchAdapter();
    expect(adapter.buildSearchUrl("cat eye polish", "https://www.temu.com/ca/product-g-1.html"))
      .toBe("https://www.temu.com/ca/search_result.html?search_key=cat+eye+polish&search_method=user");
  });

  it("extracts product facts from rendered search cards", () => {
    const document = new DOMParser().parseFromString(`
      <ul>
        <li>
          <a aria-label="Cat eye polish" href="https://www.temu.com/ca/cat-eye-g-123.html">
            <span>$3.50 CAD</span>
          </a>
        </li>
      </ul>
    `, "text/html");
    const products = new TemuSearchAdapter().extractProducts(document);
    expect(products).toEqual([{
      name: "Cat eye polish",
      priceStr: "$3.50 CAD",
      price: 3.5,
      currency: "CAD",
      productId: "123",
      productUrl: "https://www.temu.com/ca/cat-eye-g-123.html",
    }]);
  });

  it("reads each card price instead of the first price in the results container", () => {
    const document = new DOMParser().parseFromString(`
      <div class="goods-list">
        <div class="card"><a href="https://www.temu.com/ca/one-g-1.html" aria-label="One"><img src="one"><span>$3.50 CAD</span></a></div>
        <div class="card"><a href="https://www.temu.com/ca/two-g-2.html" aria-label="Two"><img src="two"><span>$8.25 CAD</span></a></div>
      </div>
    `, "text/html");
    const products = new TemuSearchAdapter().extractProducts(document);
    expect(products.map(({ price }) => price)).toEqual([3.5, 8.25]);
  });
});