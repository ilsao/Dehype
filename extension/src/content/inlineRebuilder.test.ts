import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEHYPE_ELEMENT_ID } from "../adapters/productAdapter";
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
        source: "local",
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
        source: "local",
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
        source: "local",
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

  it("exposes a keyboard-operable page restore control", () => {
    document.body.innerHTML = `<h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>`;
    const onRestore = vi.fn();
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      { source: "local", findNeutralizationTargets: () => [], onRestore },
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
      { source: "local", findNeutralizationTargets: () => [], onRestore: vi.fn() },
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
        source: "local",
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
