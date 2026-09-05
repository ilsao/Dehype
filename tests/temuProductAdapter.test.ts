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

function markAsVisible(element: HTMLElement): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      width: 180,
      height: 44,
      top: 0,
      right: 180,
      bottom: 44,
      left: 0,
      toJSON: () => ({}),
    }),
  });
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
      originalPrice: { id: "test-id-3", value: "NT$1,007.40" },
      currentPrice: { id: "test-id-2", value: "NT$4.58" },
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

  it("classifies promotions while preserving and toning down commerce controls", () => {
    const document = new DOMParser().parseFromString(
      `
        <main>
          <h1 class="_25g_jM0z">Ceramic mug</h1>
          <div data-testid="countdown-banner">Flash sale 01:00:00</div>
          <aside data-dehype-persuasion>Spin to win</aside>
          <section>Limited time <button>Add to cart</button></section>
          <button data-testid="coupon-button">Apply coupon</button>
          <button id="primary-action">Add to cart</button>
          <button id="delivery">Free shipping for this item</button>
          <div class="goodsRecommend">Explore your interests</div>
        </main>
      `,
      "text/html",
    );
    const adapter = new TemuProductAdapter();
    adapter.extractProductInfo(document, productUrl);

    const targets = adapter.findNeutralizationTargets(document);
    const targetFor = (selector: string) =>
      targets.find(({ element }) => element === document.querySelector(selector));

    expect(targetFor('[data-testid="countdown-banner"]')).toMatchObject({
      action: "suppress",
      reason: "countdown",
      presentation: "hidden-container",
    });
    expect(targetFor("aside")).toMatchObject({
      action: "suppress",
      reason: "promotion",
      presentation: "hidden-container",
    });
    expect(targetFor('[data-testid="coupon-button"]')).toMatchObject({
      action: "suppress",
      reason: "promotion",
    });
    expect(targetFor(".goodsRecommend")).toMatchObject({
      action: "suppress",
      reason: "recommendation",
    });
    expect(targetFor("#primary-action")).toMatchObject({
      action: "deemphasize",
      reason: "promotion",
      presentation: "neutral-action",
    });
    expect(targetFor("#delivery")).toMatchObject({
      action: "deemphasize",
      presentation: "neutral-fact",
    });
    expect(targetFor("section")).toBeUndefined();
  });

  it("classifies localized urgency, scarcity, and social-proof text", () => {
    const document = new DOMParser().parseFromString(
      `
        <main>
          <h1 class="_25g_jM0z">Ceramic mug</h1>
          <span id="countdown">倒數 01:00:00</span>
          <span id="scarcity">仅剩 3 件</span>
          <span id="ranking">#2 熱銷排行</span>
          <span id="coupon">限时优惠 領券</span>
          <button id="cart">加入購物車</button>
        </main>
      `,
      "text/html",
    );
    const adapter = new TemuProductAdapter();
    adapter.extractProductInfo(document, productUrl);
    const targets = adapter.findNeutralizationTargets(document);
    const actionFor = (selector: string) =>
      targets.find(({ element }) => element === document.querySelector(selector))
        ?.action;

    expect(actionFor("#countdown")).toBe("suppress");
    expect(actionFor("#scarcity")).toBe("suppress");
    expect(actionFor("#ranking")).toBe("suppress");
    expect(actionFor("#coupon")).toBe("suppress");
    expect(actionFor("#cart")).toBe("deemphasize");
  });

  it("canonicalizes split Temu price rows and targets the complete rows", () => {
    const document = new DOMParser().parseFromString(
      `
        <h1 class="_25g_jM0z">Folding pliers</h1>
        <div id="goods_price">
          <div id="discount"><span>48% OFF</span></div>
          <div id="original-row">
            <span class="_14At0Pe5">$9.04</span>
            <span aria-hidden="true">9.04</span>
          </div>
          <div id="current-row">
            <span class="_14At0Pe5">Est. $4.64</span>
            <span aria-hidden="true">Est.</span><span aria-hidden="true">CA$</span><span aria-hidden="true">4</span><span aria-hidden="true">.64</span>
          </div>
        </div>
      `,
      "text/html",
    );
    let nextId = 0;
    const adapter = new TemuProductAdapter((element) => {
      const id = `test-id-${++nextId}`;
      element?.setAttribute(DEHYPE_ELEMENT_ID, id);
      return id;
    });

    const productInfo = adapter.extractProductInfo(document, productUrl);

    expect(productInfo.originalPrice).toEqual({
      id: "test-id-2",
      value: "CA$9.04",
    });
    expect(productInfo.currentPrice).toEqual({
      id: "test-id-3",
      value: "Estimated CA$4.64",
    });
    expect(document.querySelector("#original-row")?.getAttribute(DEHYPE_ELEMENT_ID))
      .toBe("test-id-2");
    expect(document.querySelector("#current-row")?.getAttribute(DEHYPE_ELEMENT_ID))
      .toBe("test-id-3");
    expect(document.querySelector("#original-row ._14At0Pe5")?.hasAttribute(DEHYPE_ELEMENT_ID))
      .toBe(false);
  });

  it("targets complete promotional containers and distinct neutral presentations", () => {
    const document = new DOMParser().parseFromString(
      `
        <h1 class="_25g_jM0z">Folding pliers</h1>
        <header id="mainHeader"><div class="_33LMUpZn" id="black-rail"><span>01:06:54</span></div></header>
        <div data-dehype-promotion-container id="labour-day">Labour Day — 20% OFF</div>
        <section class="DQPvwQBO _3csHYvw1" id="purchase-card">
          <img data-main-image src="https://example.test/pliers.png">
          <button class="_3A7bjOr2 _36RgGpaI" id="cart">Add to cart</button>
        </section>
        <button id="delivery">Free shipping for this item</button>
      `,
      "text/html",
    );

    const adapter = new TemuProductAdapter();
    adapter.extractProductInfo(document, productUrl);
    const targets = adapter.findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);
    expect(target("black-rail")).toMatchObject({
      action: "suppress",
      presentation: "hidden-container",
    });
    expect(target("labour-day")).toMatchObject({
      action: "suppress",
      presentation: "hidden-container",
    });
    expect(target("purchase-card")).toMatchObject({
      action: "deemphasize",
      presentation: "neutral-surface",
    });
    expect(target("cart")).toMatchObject({
      action: "deemphasize",
      presentation: "neutral-action",
    });
    expect(target("delivery")).toMatchObject({
      action: "deemphasize",
      presentation: "neutral-fact",
    });
  });

  it("suppresses the current Temu sale heading and Labour Day benefit banner", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <div class="Y3CaoPDB rm-KNEZ1" id="labour-day-banner">
            <img alt="">
            <div id="splide01">
              <span>Free shipping</span>
              <span>20% OFF on orders</span>
            </div>
          </div>
          <section id="purchase-card">
            <div class="_3mw8ps2R" id="sale-heading"><span id="big-sale">BIG SALE</span></div>
            <label>Color: Olive green</label>
            <select id="quantity"><option>1</option></select>
            <button id="primary-cart">Add to cart</button>
          </section>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("labour-day-banner")).toMatchObject({
      action: "suppress",
      reason: "promotion",
      presentation: "hidden-container",
    });
    expect(target("big-sale")).toMatchObject({
      action: "suppress",
      reason: "promotion",
      presentation: "hidden-container",
    });
    expect(target("sale-heading")).toMatchObject({
      action: "suppress",
      reason: "promotion",
      presentation: "hidden-container",
    });
    expect(target("purchase-card")).toBeUndefined();
    expect(target("quantity")).toBeUndefined();
    expect(target("primary-cart")).toMatchObject({
      action: "deemphasize",
      presentation: "neutral-action",
    });
  });

  it("suppresses a promotional cart control when a primary control remains", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <button id="primary-cart">Add to cart</button>
          <div role="button" id="promotional-cart">
            <span>-63% now! Add to cart!</span>
            <span>Arrives in 3 business days</span>
          </div>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("promotional-cart")).toMatchObject({
      action: "suppress",
      reason: "promotion",
      presentation: "hidden-container",
    });
    expect(target("primary-cart")).toMatchObject({
      action: "deemphasize",
      presentation: "neutral-action",
    });
  });

  it("preserves a promotional cart control when it is the only purchase control", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <div role="button" id="only-cart">-63% now! Add to cart!</div>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    expect(
      targets.find(({ element }) => element.id === "only-cart"),
    ).toMatchObject({
      action: "rewrite-text",
      presentation: "neutral-action",
      replacementText: "Add to cart",
    });
  });

  it("targets the complete promotional card and urgency badge containers", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="urgency-row">
          <div id="last-day-badge"><span>LAST DAY</span></div>
          <div id="final-badge"><span>FINAL 45</span></div>
        </div>
        <div id="rightContent">
          <section id="amazing-find-card">
            <header><strong>AMAZING FIND</strong><span>Shop on Temu</span></header>
            <div><img src="product.png"><span>Model: Drill 3pcs</span></div>
            <label>Qty <select><option>1</option></select></label>
            <button id="card-cart">Add to cart</button>
          </section>
          <div role="button" id="primary-cart"><div><span>Add to cart</span><span>Arrives in 3 business days</span></div></div>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("amazing-find-card")).toMatchObject({
      action: "remove",
      reason: "promotion",
      presentation: "removed-container",
    });
    expect(target("last-day-badge")).toMatchObject({
      action: "suppress",
      reason: "countdown",
      presentation: "hidden-container",
    });
    expect(target("final-badge")).toMatchObject({
      action: "suppress",
      reason: "countdown",
      presentation: "hidden-container",
    });
  });

  it.each(["Great Find", "Top Pick", "Hot Deal", "Amazing Offer"])(
    "recognizes the %s promotional-card heading",
    (heading) => {
      const document = new DOMParser().parseFromString(
        `<div id="rightContent">
          <section id="offer-card"><strong>${heading}</strong><button>Add to cart</button></section>
          <button id="primary-cart">Add to cart</button>
        </div>`,
        "text/html",
      );

      expect(
        new TemuProductAdapter()
          .findNeutralizationTargets(document)
          .find(({ element }) => element.id === "offer-card"),
      ).toMatchObject({ action: "remove", reason: "promotion" });
    },
  );

  it.each(["Final Day", "Last 30", "final-day!", "LAST: 7"])(
    "recognizes the %s urgency badge",
    (copy) => {
      const document = new DOMParser().parseFromString(
        `<div id="badge"><span>${copy}</span></div>`,
        "text/html",
      );

      expect(
        new TemuProductAdapter()
          .findNeutralizationTargets(document)
          .find(({ element }) => element.id === "badge"),
      ).toMatchObject({ action: "suppress", reason: "countdown" });
    },
  );

  it("does not require promotional blocks or match isolated generic words", () => {
    const document = new DOMParser().parseFromString(
      `<div id="rightContent">
        <h1>Amazing cordless drill</h1>
        <p>The final specification is available.</p>
        <span>45</span>
        <button id="primary-cart">Add to cart</button>
      </div>`,
      "text/html",
    );
    const targets = new TemuProductAdapter().findNeutralizationTargets(document);

    expect(targets.some(({ action }) => action === "remove")).toBe(false);
    expect(targets.filter(({ reason }) => reason === "countdown")).toEqual([]);
  });

  it("keeps the only purchase card and neutralizes its promotional heading", () => {
    const document = new DOMParser().parseFromString(
      `<div id="rightContent">
        <section id="only-card">
          <strong id="heading">AMAZING FIND</strong>
          <button id="only-cart">Add to cart</button>
        </section>
      </div>`,
      "text/html",
    );
    const targets = new TemuProductAdapter().findNeutralizationTargets(document);

    expect(targets.find(({ element }) => element.id === "only-card")).toBeUndefined();
    expect(targets.find(({ element }) => element.id === "heading")).toMatchObject({
      action: "suppress",
      reason: "promotion",
    });
    expect(targets.find(({ element }) => element.id === "only-cart")).toMatchObject({
      action: "deemphasize",
    });
  });

  it("preserves a visible promotional cart control when the plain cart control is hidden", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <button id="hidden-primary-cart" style="display: none">Add to cart</button>
          <section data-dehype-persuasion id="promo-shell">
            <button id="visible-promotional-cart">
              <span id="promo-label">-9% now! Add to cart!</span>
            </button>
          </section>
        </div>
      `,
      "text/html",
    );
    markAsVisible(
      document.querySelector<HTMLElement>("#visible-promotional-cart")!,
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("promo-label")).toMatchObject({
      action: "rewrite-text",
      reason: "promotion",
      presentation: "neutral-action",
      replacementText: "Add to cart",
    });
    expect(target("promo-shell")).toBeUndefined();
    expect(target("visible-promotional-cart")).toBeUndefined();
  });

  it("keeps localized cart copy when neutralizing a promotional cart control", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <button id="cart">-63% now! 加入購物車!</button>
        </div>
      `,
      "text/html",
    );
    markAsVisible(document.querySelector<HTMLElement>("#cart")!);

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);

    expect(
      targets.find(({ element }) => element.id === "cart"),
    ).toMatchObject({
      action: "rewrite-text",
      presentation: "neutral-action",
      replacementText: "加入購物車",
    });
  });

  it("suppresses unrelated promotion while preserving every Go to cart control", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="main_scale">
          <main class="baseContent" role="main">
            <h1 class="_25g_jM0z">Kitchen scissors</h1>
            <div id="rightContent">
              <section id="lightning-card">
                <span>LIGHTNING DEAL</span>
                <div role="button">Go to cart</div>
              </section>
              <section id="primary-purchase-row" class="_100Uy0HO">
                <button>decrease quantity</button>
                <div role="button">Go to cart</div>
                <button>increase quantity</button>
              </section>
            </div>
            <section id="goodsRecommend">Explore your interests</section>
          </main>
        </div>
        <aside id="mainStickyBenefitBar">Free shipping — Price Match Guarantee</aside>
      `,
      "text/html",
    );
    const adapter = new TemuProductAdapter();
    const targets = adapter.findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("goodsRecommend")).toMatchObject({
      action: "suppress",
      reason: "recommendation",
    });
    expect(target("mainStickyBenefitBar")).toMatchObject({
      action: "suppress",
      reason: "promotion",
    });
    expect(target("lightning-card")).toBeUndefined();
    expect(target("primary-purchase-row")).toBeUndefined();
    expect(
      targets.some(({ element }) => /go to cart/i.test(element.textContent ?? "")),
    ).toBe(false);
    expect(adapter.findNeutralLayoutRoot(document)?.className).toBe("baseContent");
  });

  it("never suppresses a lightning card when it is the only cart control", () => {
    const document = new DOMParser().parseFromString(
      `
        <h1 class="_25g_jM0z">Kitchen scissors</h1>
        <div id="rightContent">
          <section id="only-purchase-card">
            <span>LIGHTNING DEAL</span>
            <div role="button">Go to cart</div>
          </section>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    expect(
      targets.find(({ element }) => element.id === "only-purchase-card"),
    ).toBeUndefined();
  });

  it("preserves every Go to cart summary and quantity action row", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <section id="upper-cart-summary">
            <img src="https://example.test/selected-variant.png">
            <span>Added: 2</span><label>Qty<select><option>1</option></select></label>
            <div role="button">Go to cart</div>
          </section>
          <section id="lower-cart-row" class="_100Uy0HO">
            <button aria-label="decrease quantity"></button>
            <span>1 Added 2</span>
            <button aria-label="increase quantity"></button>
            <div role="button">Go to cart</div>
          </section>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("upper-cart-summary")).toBeUndefined();
    expect(target("lower-cart-row")).toBeUndefined();
  });

  it("recognizes visible minus and plus controls in the lower quantity action row", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <section id="upper-cart-summary">
            <span>Added: 1</span>
            <label>Qty <select><option>1</option></select></label>
            <div role="button">Go to cart</div>
          </section>
          <section id="lower-cart-row">
            <button>−</button>
            <span>1 Added</span>
            <button>+</button>
            <div role="button">Go to cart</div>
          </section>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const target = (id: string) =>
      targets.find(({ element }) => element.id === id);

    expect(target("upper-cart-summary")).toBeUndefined();
    expect(target("lower-cart-row")).toBeUndefined();
  });

  it("protects nested, disabled, localized, and out-of-panel Go to cart controls", () => {
    const document = new DOMParser().parseFromString(
      `
        <section data-dehype-persuasion id="outside-promotion">
          <button id="outside-cart"><span id="outside-label">Go to cart</span></button>
        </section>
        <div id="rightContent">
          <section data-dehype-persuasion id="disabled-promotion">
            <button id="disabled-cart" disabled><span>前往購物車</span></button>
          </section>
          <section data-dehype-persuasion id="aria-disabled-promotion">
            <div role="button" id="aria-disabled-cart" aria-disabled="true">
              <span>前往购物车</span>
            </div>
          </section>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    const protectedIds = new Set([
      "outside-promotion",
      "outside-cart",
      "outside-label",
      "disabled-promotion",
      "disabled-cart",
      "aria-disabled-promotion",
      "aria-disabled-cart",
    ]);

    expect(
      targets.filter(({ element }) => protectedIds.has(element.id)),
    ).toEqual([]);
  });

  it("preserves an upper cart summary when no lower quantity action row exists", () => {
    const document = new DOMParser().parseFromString(
      `
        <div id="rightContent">
          <section id="only-cart-summary">
            <span>Added: 2</span>
            <label>Qty <select><option>1</option></select></label>
            <div role="button">Go to cart</div>
          </section>
        </div>
      `,
      "text/html",
    );

    const targets = new TemuProductAdapter().findNeutralizationTargets(document);
    expect(
      targets.find(({ element }) => element.id === "only-cart-summary"),
    ).toBeUndefined();
  });
});
