import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEHYPE_ELEMENT_ID } from "../adapters/productAdapter";
import { TemuProductAdapter } from "../adapters/temuProductAdapter";
import { applyInlineRebuild } from "./inlineRebuilder";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  document.documentElement
    .querySelectorAll("#dehype-inline-rebuild-control, #dehype-inline-rebuild-style")
    .forEach((element) => element.remove());
});

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

describe("inline page rebuilder", () => {
  it("inserts neutral values without destroying source descendants", () => {
    document.body.innerHTML = `
      <h1 ${DEHYPE_ELEMENT_ID}="name-id"><span id="kept-child">Hot sale Mug!</span></h1>
      <div data-dehype-persuasion id="promo">Flash sale</div>
    `;
    const source = document.querySelector<HTMLElement>("h1");
    const child = document.querySelector("#kept-child");
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [{
          element: document.querySelector<HTMLElement>("#promo")!,
          action: "suppress",
          reason: "promotion",
          presentation: "hidden-container",
        }],
        onRestore: vi.fn(),
      },
    );

    expect(handle.appliedFields).toEqual(["name"]);
    expect(handle.suppressedElementCount).toBe(1);
    expect(handle.deemphasizedElementCount).toBe(0);
    expect(source?.textContent).toBe("Hot sale Mug!");
    expect(child?.isConnected).toBe(true);
    const replacement = document.querySelector<HTMLElement>(
      '[data-dehype-replacement="name"]',
    );
    expect(replacement?.textContent).toBe("Mug");
    expect(replacement?.tagName).toBe("H1");
    const pageStyle = document.querySelector("#dehype-inline-rebuild-style")
      ?.textContent;
    expect(pageStyle).toContain("border-radius: 0 !important");
    expect(pageStyle).toContain("background: transparent !important");
    expect(pageStyle).toContain("padding: 0 !important");
    expect(document.querySelector("#promo")?.getAttribute("data-dehype-suppressed"))
      .toBe("hidden-container");

    handle.restore();
    expect(child?.isConnected).toBe(true);
    expect(source?.hasAttribute("data-dehype-original-hidden")).toBe(false);
    expect(document.querySelector("[data-dehype-replacement]")).toBeNull();
    expect(document.querySelector("#promo")?.hasAttribute("data-dehype-suppressed"))
      .toBe(false);
  });

  it("does not count metadata-only values as visible page fields", () => {
    document.head.innerHTML = `<meta property="og:title" ${DEHYPE_ELEMENT_ID}="metadata-name" content="Mug">`;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "metadata-name", value: "Mug" } },
      {
        source: "model",
        findNeutralizationTargets: () => [],
        onRestore: vi.fn(),
      },
    );

    expect(handle.appliedFields).toEqual([]);
    expect(document.querySelector("[data-dehype-replacement]")).toBeNull();
    handle.restore();
  });

  it("restores pre-existing extension marker values and is idempotent", () => {
    document.body.innerHTML = `
      <h1 ${DEHYPE_ELEMENT_ID}="name-id" data-dehype-original-hidden="legacy">Mug</h1>
      <aside id="promo" data-dehype-suppressed="legacy">Limited time</aside>
    `;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [{
          element: document.querySelector<HTMLElement>("#promo")!,
          action: "suppress",
          reason: "promotion",
          presentation: "hidden-container",
        }],
        onRestore: vi.fn(),
      },
    );

    handle.restore();
    handle.restore();
    expect(document.querySelector("h1")?.getAttribute("data-dehype-original-hidden"))
      .toBe("legacy");
    expect(document.querySelector("#promo")?.getAttribute("data-dehype-suppressed"))
      .toBe("legacy");
  });

  it("suppresses promotional elements inserted after activation", () => {
    document.body.innerHTML = `<h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>`;
    const candidates: HTMLElement[] = [];
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => candidates.map((element) => ({
          element,
          action: "suppress" as const,
          reason: "promotion" as const,
          presentation: "hidden-container" as const,
        })),
        onRestore: vi.fn(),
      },
    );
    const latePromo = document.createElement("div");
    latePromo.textContent = "Flash sale";
    document.body.append(latePromo);
    candidates.push(latePromo);

    expect(handle.neutralizeNewElements()).toBe(1);
    expect(handle.suppressedElementCount).toBe(1);
    handle.restore();
    expect(latePromo.hasAttribute("data-dehype-suppressed")).toBe(false);
  });

  it("restores a conditional suppression when it no longer applies", () => {
    document.body.innerHTML = `
      <h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>
      <section id="backup-cart">Lightning deal cart</section>
      <section id="primary-cart">Primary cart</section>
    `;
    const backupCart = document.querySelector<HTMLElement>("#backup-cart")!;
    const primaryCart = document.querySelector<HTMLElement>("#primary-cart")!;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () =>
          primaryCart.isConnected
            ? [{
                element: backupCart,
                action: "suppress" as const,
                reason: "promotion" as const,
                presentation: "hidden-container" as const,
              }]
            : [],
        onRestore: vi.fn(),
      },
    );

    expect(backupCart.getAttribute("data-dehype-suppressed")).toBe(
      "hidden-container",
    );
    primaryCart.remove();
    expect(handle.neutralizeNewElements()).toBe(0);
    expect(backupCart.hasAttribute("data-dehype-suppressed")).toBe(false);
    expect(handle.suppressedElementCount).toBe(0);
    handle.restore();
  });

  it("removes and restores a promotional card at its original position", () => {
    document.body.innerHTML = `
      <main>
        <section id="upper-card"><span>BIG SALE</span></section>
        <section id="lower-card">-61% now! Add to cart!</section>
      </main>
    `;
    const upperCard = document.querySelector<HTMLElement>("#upper-card")!;
    const lowerCard = document.querySelector<HTMLElement>("#lower-card")!;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "metadata-only", value: "Mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [
          {
            element: upperCard,
            action: "remove",
            reason: "promotion",
            presentation: "removed-container",
          },
        ],
        onRestore: vi.fn(),
      },
    );

    expect(upperCard.getAttribute("data-dehype-suppressed")).toBe(
      "removed-container",
    );
    expect(document.querySelector("main")?.children[0]).toBe(upperCard);
    expect(handle.suppressedElementCount).toBe(1);

    handle.neutralizeNewElements();
    expect(upperCard.getAttribute("data-dehype-suppressed")).toBe(
      "removed-container",
    );
    handle.restore();
    expect(document.querySelector("main")?.children[0]).toBe(upperCard);
    expect(document.querySelector("main")?.children[1]).toBe(lowerCard);
  });

  it("keeps a promotional card mounted and suppressed across rescans", () => {
    document.body.innerHTML = `
      <main>
        <section id="upper-card"><span>BIG SALE</span></section>
        <section id="lower-card">-61% now! Add to cart!</section>
      </main>
    `;
    const upperCard = document.querySelector<HTMLElement>("#upper-card")!;
    const main = document.querySelector("main")!;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "metadata-only", value: "Mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [
          {
            element: upperCard,
            action: "remove",
            reason: "promotion",
            presentation: "removed-container",
          },
        ],
        onRestore: vi.fn(),
      },
    );

    expect(handle.neutralizeNewElements()).toBe(0);
    expect(upperCard.isConnected).toBe(true);
    expect(upperCard.getAttribute("data-dehype-suppressed")).toBe(
      "removed-container",
    );

    handle.restore();
    expect(main.children[0]).toBe(upperCard);
    expect(main.children.item(1)?.id).toBe("lower-card");
  });

  it("centers and restores the adapter-provided layout root", () => {
    document.body.innerHTML = `
      <main id="layout-root"><h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1></main>
    `;
    const layoutRoot = document.querySelector<HTMLElement>("#layout-root")!;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [],
        neutralLayoutRoot: layoutRoot,
        onRestore: vi.fn(),
      },
    );

    expect(layoutRoot.getAttribute("data-dehype-layout-root")).toBe("true");
    expect(document.querySelector("#dehype-inline-rebuild-style")?.textContent)
      .toContain("margin-inline: auto !important");
    handle.restore();
    expect(layoutRoot.hasAttribute("data-dehype-layout-root")).toBe(false);
  });

  it("exposes a keyboard-operable page restore control", () => {
    document.body.innerHTML = `<h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>`;
    const onRestore = vi.fn();
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      { source: "structural", findNeutralizationTargets: () => [], onRestore },
    );
    const host = document.querySelector<HTMLElement>("#dehype-inline-rebuild-control");
    const button = host?.shadowRoot?.querySelector<HTMLButtonElement>("button");

    button?.click();
    expect(button?.type).toBe("button");
    expect(onRestore).toHaveBeenCalledOnce();
    handle.restore();
  });

  it("renders original and current prices once without strikethrough", () => {
    document.body.innerHTML = `
      <div id="goods_price">
        <div id="original" ${DEHYPE_ELEMENT_ID}="original-id"><s>CA$9.04</s></div>
        <div id="current" ${DEHYPE_ELEMENT_ID}="current-id"><span>Est.</span><span>CA$</span><span>4.64</span></div>
        <div id="discount" ${DEHYPE_ELEMENT_ID}="discount-id">48% OFF</div>
      </div>
    `;
    const handle = applyInlineRebuild(
      document,
      {
        name: { id: "metadata-only", value: "Pliers" },
        originalPrice: { id: "original-id", value: "CA$9.04" },
        currentPrice: { id: "current-id", value: "Estimated CA$4.64" },
        discount: { id: "discount-id", value: "48% OFF" },
      },
      { source: "structural", findNeutralizationTargets: () => [], onRestore: vi.fn() },
    );

    const summary = document.querySelector<HTMLElement>(
      "[data-dehype-price-summary]",
    );
    expect(summary?.textContent).toBe(
      "Original price:CA$9.04Current estimated price:CA$4.64",
    );
    expect(summary?.querySelectorAll("[data-dehype-price-line]")).toHaveLength(2);
    expect(summary?.querySelector("del, s")).toBeNull();
    expect(document.querySelector("#original s")?.isConnected).toBe(true);
    expect(document.querySelector("#discount")?.getAttribute("data-dehype-original-hidden"))
      .toBe("true");
    expect(handle.appliedFields).toEqual(["originalPrice", "currentPrice"]);

    handle.restore();
    expect(document.querySelector("[data-dehype-price-summary]")).toBeNull();
    expect(document.querySelector("#original")?.hasAttribute("data-dehype-original-hidden"))
      .toBe(false);
    expect(document.querySelector("#current")?.hasAttribute("data-dehype-original-hidden"))
      .toBe(false);
    expect(document.querySelector("#discount")?.hasAttribute("data-dehype-original-hidden"))
      .toBe(false);
  });

  it("removes the purchase-card frame without adding a gray action background", () => {
    document.body.innerHTML = `
      <section id="card"><button id="cart">Add to cart</button></section>
    `;
    const card = document.querySelector<HTMLElement>("#card")!;
    const cart = document.querySelector<HTMLElement>("#cart")!;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "metadata-only", value: "Pliers" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [
          {
            element: card,
            action: "deemphasize",
            reason: "promotion",
            presentation: "neutral-surface",
          },
          {
            element: cart,
            action: "deemphasize",
            reason: "promotion",
            presentation: "neutral-action",
          },
        ],
        onRestore: vi.fn(),
      },
    );

    const pageStyle = document.querySelector("#dehype-inline-rebuild-style")
      ?.textContent;
    expect(card.getAttribute("data-dehype-deemphasized")).toBe("neutral-surface");
    expect(cart.getAttribute("data-dehype-deemphasized")).toBe("neutral-action");
    expect(pageStyle).toContain('data-dehype-deemphasized="neutral-surface"] {\n      border: 0 !important');
    expect(pageStyle).toContain('data-dehype-deemphasized="neutral-action"] {');
    expect(pageStyle).not.toContain("background-color: #e2e8f0");

    handle.restore();
    expect(card.hasAttribute("data-dehype-deemphasized")).toBe(false);
    expect(cart.hasAttribute("data-dehype-deemphasized")).toBe(false);
  });
});


describe("commerce stability with the real Temu adapter", () => {
  it("never changes a Go to cart control across repeated DOM scans", () => {
    document.body.innerHTML = `
      <section data-dehype-persuasion id="cart-card">
        <div role="button" id="go-to-cart" class="temu-cart">
          <span id="go-to-cart-label">Go to cart</span>
        </div>
      </section>`;
    const adapter = new TemuProductAdapter();
    const card = document.querySelector<HTMLElement>("#cart-card")!;
    const button = document.querySelector<HTMLElement>("#go-to-cart")!;
    const label = document.querySelector<HTMLElement>("#go-to-cart-label")!;
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    const originalButtonAttributes = button.outerHTML;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "metadata", value: "Mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () =>
          adapter.findNeutralizationTargets(document),
        onRestore: vi.fn(),
      },
    );

    for (let index = 0; index < 20; index += 1) {
      handle.neutralizeNewElements();
    }

    expect(card.isConnected).toBe(true);
    expect(button.outerHTML).toBe(originalButtonAttributes);
    expect(label.textContent).toBe("Go to cart");
    button.click();
    expect(clicked).toHaveBeenCalledTimes(1);

    handle.restore();
    expect(button.outerHTML).toBe(originalButtonAttributes);
    button.click();
    expect(clicked).toHaveBeenCalledTimes(2);
  });

  it("settles observer updates and preserves the surviving nested label", async () => {
    document.body.innerHTML = `
      <div id="rightContent">
        <section id="upper"><span>BIG SALE</span><button>Add to cart</button></section>
        <button id="remaining"><span style="color:white">-61% now! Add to cart!</span></button>
        <p id="shipping">Free shipping</p>
      </div>`;
    const adapter = new TemuProductAdapter();
    const upper = document.querySelector<HTMLElement>("#upper")!;
    const button = document.querySelector<HTMLButtonElement>("#remaining")!;
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    const handle = applyInlineRebuild(document, { name: { id: "metadata", value: "Mug" } }, {
      source: "structural",
      findNeutralizationTargets: () => adapter.findNeutralizationTargets(document),
      onRestore: vi.fn(),
    });
    let updates = 0;
    const observer = new MutationObserver(() => {
      updates += 1;
      if (updates < 10) handle.neutralizeNewElements();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    for (let index = 0; index < 20; index += 1) handle.neutralizeNewElements();
    expect(upper.isConnected).toBe(true);
    expect(upper.getAttribute("data-dehype-suppressed")).toBe(
      "removed-container",
    );
    expect(button.querySelector("span")?.closest("[data-dehype-suppressed]")).toBeNull();
    expect(button.textContent).toContain("Add to cart");
    document.querySelector("#rightContent")!.prepend(upper);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(updates).toBeLessThan(3);
    expect(upper.isConnected).toBe(true);
    expect(upper.getAttribute("data-dehype-suppressed")).toBe(
      "removed-container",
    );
    expect(clicked).not.toHaveBeenCalled();
    observer.disconnect();
    button.remove(); // The original restoration anchor no longer exists.
    expect(() => handle.restore()).not.toThrow();
    handle.restore();
    expect(upper.isConnected).toBe(true);
    button.click();
    expect(clicked).toHaveBeenCalledTimes(1);
  });

  it.each(["disabled", 'aria-disabled="true"'])("keeps the only usable nested cart label with a %s alternative", (disabled) => {
    document.body.innerHTML = `<div id="rightContent">
      <button ${disabled}>Add to cart</button>
      <section data-dehype-persuasion><button id="cart"><span>-61% now! Add to cart!</span></button></section>
    </div>`;
    const adapter = new TemuProductAdapter();
    const handle = applyInlineRebuild(document, { name: { id: "metadata", value: "Mug" } }, {
      source: "structural", findNeutralizationTargets: () => adapter.findNeutralizationTargets(document), onRestore: vi.fn(),
    });
    const label = document.querySelector("#cart span")!;
    for (let index = 0; index < 5; index += 1) handle.neutralizeNewElements();
    expect(label.closest("[data-dehype-suppressed]")).toBeNull();
    expect(label.isConnected).toBe(true);
    handle.restore();
  });

  it("keeps adapter-selected promotional controls suppressed across rescans", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Chrome");
    document.body.innerHTML = `
      <main>
        <h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>
        <div id="rightContent">
          <button id="primary-cart">Add to cart</button>
          <div id="promotional-cart" role="button">-63% now! Add to cart!</div>
        </div>
      </main>
    `;
    const promotionalCart = document.querySelector<HTMLElement>(
      "#promotional-cart",
    )!;
    const primaryCart = document.querySelector<HTMLElement>("#primary-cart")!;
    markAsVisible(primaryCart);
    Object.defineProperty(promotionalCart, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        width: promotionalCart.hasAttribute("data-dehype-suppressed") ? 0 : 180,
        height: promotionalCart.hasAttribute("data-dehype-suppressed") ? 0 : 44,
        top: 0,
        right: 180,
        bottom: 44,
        left: 0,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(promotionalCart, "getClientRects", {
      value: () =>
        promotionalCart.hasAttribute("data-dehype-suppressed") ? [] : [{}],
    });
    const adapter = new TemuProductAdapter();
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () =>
          adapter.findNeutralizationTargets(document),
        onRestore: vi.fn(),
      },
    );

    expect(promotionalCart.getAttribute("data-dehype-suppressed")).toBe(
      "hidden-container",
    );
    handle.neutralizeNewElements();
    handle.neutralizeNewElements();
    expect(promotionalCart.getAttribute("data-dehype-suppressed")).toBe(
      "hidden-container",
    );

    handle.restore();
    expect(promotionalCart.hasAttribute("data-dehype-suppressed")).toBe(false);
  });

  it("preserves descendants while transitioning a cart control from rewrite to suppression", () => {
    document.body.innerHTML = `
      <h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>
      <div id="promo" role="button">-35% now! Add to cart!<span id="arrival">Arrives in 3 business days</span></div>
    `;
    const promo = document.querySelector<HTMLElement>("#promo")!;
    const arrival = document.querySelector<HTMLElement>("#arrival")!;
    let action: "rewrite-text" | "suppress" = "rewrite-text";
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "structural",
        findNeutralizationTargets: () => [{
          element: promo,
          action,
          reason: "promotion",
          presentation: action === "suppress" ? "hidden-container" : "neutral-action",
          ...(action === "rewrite-text" ? { replacementText: "Add to cart" } : {}),
        }],
        onRestore: vi.fn(),
      },
    );

    expect(arrival.isConnected).toBe(true);
    expect(promo.textContent).toBe("Add to cartArrives in 3 business days");

    action = "suppress";
    handle.neutralizeNewElements();
    expect(promo.getAttribute("data-dehype-suppressed")).toBe("hidden-container");
    expect(promo.textContent).toBe(
      "-35% now! Add to cart!Arrives in 3 business days",
    );
    expect(arrival.isConnected).toBe(true);

    handle.restore();
    expect(promo.hasAttribute("data-dehype-suppressed")).toBe(false);
    expect(arrival.isConnected).toBe(true);
  });

  it("keeps the visible promotional cart button clickable when a plain cart button is hidden", () => {
    document.body.innerHTML = `
      <div id="rightContent">
        <button style="display: none">Add to cart</button>
        <section data-dehype-persuasion id="promo-shell">
          <button id="cart"><span id="cart-label">-9% now! Add to cart!</span></button>
        </section>
    </div>`;
    const adapter = new TemuProductAdapter();
    const button = document.querySelector<HTMLButtonElement>("#cart")!;
    markAsVisible(button);
    const clicked = vi.fn();
    button.addEventListener("click", clicked);
    const handle = applyInlineRebuild(document, { name: { id: "metadata", value: "Mug" } }, {
      source: "structural",
      findNeutralizationTargets: () => adapter.findNeutralizationTargets(document),
      onRestore: vi.fn(),
    });

    for (let index = 0; index < 5; index += 1) handle.neutralizeNewElements();
    button.click();

    expect(button.textContent).toBe("Add to cart");
    expect(button.hasAttribute("data-dehype-deemphasized")).toBe(false);
    expect(button.hasAttribute("data-dehype-suppressed")).toBe(false);
    expect(document.querySelector("#promo-shell")?.hasAttribute("data-dehype-suppressed"))
      .toBe(false);
    expect(document.querySelector("#cart-label")?.closest("[data-dehype-suppressed]"))
      .toBeNull();
    expect(clicked).toHaveBeenCalledTimes(1);
    handle.restore();
    expect(button.textContent).toBe("-9% now! Add to cart!");
    expect(button.hasAttribute("data-dehype-deemphasized")).toBe(false);
  });
});
