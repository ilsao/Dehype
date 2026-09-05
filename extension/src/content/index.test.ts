import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  rebuildCurrentProduct,
  restoreCurrentProduct,
  waitForCurrentProduct,
} from "./index";

const productUrl = "https://www.temu.com/ca/sample-product-g-123456789.html";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = `
    <main>
      <h1 class="_25g_jM0z">HOT SALE Wireless Earbuds!</h1>
      <div data-testid="current-price"><span id="price-child">$12.99 today only</span></div>
      <button id="variant">Blue</button>
      <button id="add-to-cart">Add to cart</button>
      <div data-testid="countdown-banner">Flash sale 01:15:30</div>
      <img data-main-image src="https://example.test/product.png" alt="Product">
    </main>
  `;
  window.history.replaceState({}, "", productUrl);
  vi.stubGlobal("chrome", {
    runtime: {
      sendMessage: vi.fn(async () => ({
        type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
        productValues: {
          name: "Wireless Earbuds",
          currentPrice: "$12.99",
        },
        source: "structural",
      })),
    },
  });
});

afterEach(() => {
  restoreCurrentProduct();
  vi.unstubAllGlobals();
});

describe("content-script integration", () => {
  it("neutralizes once and restores the exact original DOM state", async () => {
    const name = document.querySelector("h1");
    const price = document.querySelector('[data-testid="current-price"]');
    const variant = document.querySelector("#variant");
    const image = document.querySelector("img");

    const first = await rebuildCurrentProduct();
    const second = await rebuildCurrentProduct();

    expect(first.type).toBe("DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT");
    expect(second).toEqual(first);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({
      appliedFields: ["name", "currentPrice"],
      suppressedElementCount: 1,
      deemphasizedElementCount: 1,
    });
    expect(name?.textContent).toBe("HOT SALE Wireless Earbuds!");
    expect(price?.textContent).toBe("$12.99 today only");
    expect(name?.getAttribute("data-dehype-original-hidden")).toBe("true");
    expect(document.querySelector('[data-dehype-replacement="name"]')?.textContent)
      .toBe("Wireless Earbuds");
    expect(document.querySelector('[data-dehype-price-line="current"]')?.textContent)
      .toBe("Current price:$12.99");
    expect(document.querySelector("#price-child")?.isConnected).toBe(true);
    expect(document.querySelector('[data-testid="countdown-banner"]')
      ?.getAttribute("data-dehype-suppressed")).toBe("hidden-container");
    expect(document.querySelector("#add-to-cart")
      ?.getAttribute("data-dehype-deemphasized")).toBe("neutral-action");
    expect(document.querySelector("#dehype-inline-rebuild-control")?.shadowRoot)
      .not.toBeNull();
    expect(variant?.textContent).toBe("Blue");
    expect(image?.getAttribute("src")).toBe("https://example.test/product.png");

    expect(restoreCurrentProduct()).toEqual({
      type: "DEHYPE_RESTORE_CURRENT_PRODUCT_RESULT",
    });
    expect(name?.textContent).toBe("HOT SALE Wireless Earbuds!");
    expect(price?.textContent).toBe("$12.99 today only");
    expect(name?.hasAttribute("data-dehype-original-hidden")).toBe(false);
    expect(document.querySelector("[data-dehype-replacement]")).toBeNull();
    expect(document.querySelector("[data-dehype-suppressed]")).toBeNull();
    expect(document.querySelector("[data-dehype-deemphasized]")).toBeNull();
    expect(document.querySelector("#dehype-inline-rebuild-control")).toBeNull();
  });

  it("waits for dynamically inserted essential product data", async () => {
    document.body.innerHTML = "<main></main>";
    const pending = waitForCurrentProduct(document, {
      getPageUrl: () => productUrl,
      timeoutMs: 500,
      debounceMs: 0,
    });

    document.querySelector("main")?.insertAdjacentHTML(
      "beforeend",
      '<h1 data-testid="product-title">Travel mug</h1>' +
        '<span data-testid="current-price">NT$429</span>',
    );

    await expect(pending).resolves.toMatchObject({
      name: { value: "Travel mug" },
      currentPrice: { value: "NT$429" },
    });
  });

  it("restores active text when an SPA navigation changes the URL", async () => {
    const name = document.querySelector("h1");
    await rebuildCurrentProduct();
    expect(document.querySelector('[data-dehype-replacement="name"]')?.textContent)
      .toBe("Wireless Earbuds");

    window.history.pushState({}, "", "/ca/another-product-g-987654321.html");
    document.body.append(document.createElement("span"));
    await vi.waitFor(() =>
      expect(document.querySelector("[data-dehype-replacement]")).toBeNull(),
    );
    expect(name?.textContent).toBe("HOT SALE Wireless Earbuds!");
  });

  it("restores from the on-page control without reopening the popup", async () => {
    await rebuildCurrentProduct();
    const restoreButton = document
      .querySelector<HTMLElement>("#dehype-inline-rebuild-control")
      ?.shadowRoot?.querySelector<HTMLButtonElement>("button");

    restoreButton?.click();
    expect(document.querySelector("[data-dehype-replacement]")).toBeNull();
    expect(document.querySelector("[data-dehype-suppressed]")).toBeNull();
  });

  it("suppresses a sale heading container and a promotional cart control added by text update", async () => {
    document.body.innerHTML = `
      <main>
        <h1 class="_25g_jM0z">Olive oil dispenser</h1>
        <div data-testid="current-price">$12.99</div>
        <div id="rightContent">
          <div id="sale-heading"><div><span>BIG SALE</span></div></div>
          <button id="primary-cart">Add to cart</button>
          <div id="dynamic-cart" role="button"><span>Arrives soon</span></div>
        </div>
      </main>
    `;

    await rebuildCurrentProduct();
    expect(document.querySelector("#sale-heading")?.getAttribute(
      "data-dehype-suppressed",
    )).toBe("hidden-container");
    expect(document.querySelector("#dynamic-cart")?.hasAttribute(
      "data-dehype-suppressed",
    )).toBe(false);

    document.querySelector("#dynamic-cart span")!.textContent =
      "-63% now! Add to cart!";
    await vi.waitFor(() =>
      expect(document.querySelector("#dynamic-cart")?.getAttribute(
        "data-dehype-suppressed",
      )).toBe("hidden-container"),
    );

    restoreCurrentProduct();
    expect(document.querySelector("#sale-heading")?.hasAttribute(
      "data-dehype-suppressed",
    )).toBe(false);
    expect(document.querySelector("#dynamic-cart")?.hasAttribute(
      "data-dehype-suppressed",
    )).toBe(false);
  });

  it("suppresses a dynamically inserted duplicate cart summary and restores it", async () => {
    document.body.innerHTML = `
      <main>
        <h1 class="_25g_jM0z">Olive oil dispenser</h1>
        <div data-testid="current-price">$12.99</div>
        <div id="rightContent">
          <section id="lower-cart-row">
            <button aria-label="decrease quantity"></button>
            <button aria-label="increase quantity"></button>
            <div role="button">Go to cart</div>
          </section>
        </div>
      </main>
    `;

    await rebuildCurrentProduct();
    document.querySelector("#rightContent")!.insertAdjacentHTML(
      "afterbegin",
      `
        <section id="upper-cart-summary">
          <span>Added: 2</span>
          <label>Qty <select><option>1</option></select></label>
          <div role="button">Go to cart</div>
        </section>
      `,
    );

    await vi.waitFor(() =>
      expect(document.querySelector("#upper-cart-summary")?.getAttribute(
        "data-dehype-suppressed",
      )).toBe("hidden-container"),
    );
    expect(document.querySelector("#lower-cart-row")?.hasAttribute(
      "data-dehype-suppressed",
    )).toBe(false);

    restoreCurrentProduct();
    expect(document.querySelector("#upper-cart-summary")?.hasAttribute(
      "data-dehype-suppressed",
    )).toBe(false);
  });

  it("returns an error when analysis has no visible DOM target", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    document.head.innerHTML =
      '<meta property="og:title" content="Metadata-only mug - Temu Canada">';

    const pending = rebuildCurrentProduct();
    await vi.advanceTimersByTimeAsync(1_500);
    await expect(pending).resolves.toEqual({
      type: "DEHYPE_CONTENT_SCRIPT_ERROR",
      operation: "rebuild",
      message:
        "Product values were analyzed, but no visible Temu product fields could be rebuilt.",
    });
    expect(document.querySelector("#dehype-inline-rebuild-control")).toBeNull();
    vi.useRealTimers();
  });
});
