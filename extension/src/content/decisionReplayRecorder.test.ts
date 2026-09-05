import { describe, expect, it, vi } from "vitest";

import { TemuProductAdapter } from "../adapters/temuProductAdapter";
import type { DecisionEvent } from "../shared/decisionReplay";
import { DecisionReplayRecorder } from "./decisionReplayRecorder";

describe("DecisionReplayRecorder active views", () => {
  it("does not mark persuasion targets as ProductInfo elements", () => {
    document.body.innerHTML = `
      <h1 class="_25g_jM0z">Ceramic mug</h1>
      <span data-testid="current-price">$19.99</span>
      <aside id="promotion" data-dehype-persuasion>Limited time offer</aside>
    `;
    window.history.replaceState(
      {},
      "",
      "https://www.temu.com/ca/ceramic-mug-g-123456789.html",
    );
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: vi.fn(),
    });

    recorder.start();

    expect(
      document.querySelector("#promotion")?.hasAttribute(
        "data-dehype-element-id",
      ),
    ).toBe(false);
    expect(
      new TemuProductAdapter()
        .findNeutralizationTargets(document)
        .some(({ element }) => element.id === "promotion"),
    ).toBe(true);
    recorder.stop();
  });

  it("emits a view immediately and updates that event when leaving", () => {
    document.body.innerHTML = `
      <h1 class="_25g_jM0z">Ceramic mug</h1>
      <span data-testid="current-price">$19.99</span>
    `;
    window.history.replaceState(
      {},
      "",
      "https://www.temu.com/ca/ceramic-mug-g-123456789.html",
    );
    let now = 1000;
    const events: DecisionEvent[] = [];
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: (event) => events.push(event),
      now: () => now,
    });

    recorder.start();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "PRODUCT_VIEW",
      productId: "temu:123456789",
      product: { name: "Ceramic mug", currentPrice: "$19.99" },
    });
    const eventId = events[0]?.id;

    now = 6_000;
    recorder.stop();

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      id: eventId,
      action: "PRODUCT_VIEW",
      durationMs: 5_000,
      leftAt: 6_000,
    });
  });
});

describe("DecisionReplayRecorder product clicks", () => {
  it("adds the active product snapshot to commerce actions", () => {
    document.body.innerHTML = `
      <h1 class="_25g_jM0z">Ceramic mug</h1>
      <span data-testid="current-price">$19.99</span>
      <button id="add">Add to cart</button>
    `;
    window.history.replaceState({}, "", "https://www.temu.com/ca/mug-g-1.html");
    const events: DecisionEvent[] = [];
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: (event) => events.push(event),
      now: () => 1000,
    });

    recorder.start();
    document.querySelector("#add")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(events[1]).toMatchObject({
      action: "ADD_TO_CART",
      productId: "temu:1",
      product: { name: "Ceramic mug", currentPrice: "$19.99" },
    });
    recorder.stop();
  });

  it("records checkout without guessing a product on a non-product page", () => {
    document.body.innerHTML = '<button id="checkout">Checkout</button>';
    window.history.replaceState({}, "", "https://www.temu.com/ca/cart.html");
    const events: DecisionEvent[] = [];
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: (event) => events.push(event),
      now: () => 1000,
    });

    recorder.start();
    document.querySelector("#checkout")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: "CHECKOUT", timestamp: 1000 });
    expect(events[0]).not.toHaveProperty("productId");
    expect(events[0]).not.toHaveProperty("product");
    recorder.stop();
  });

  it("records a product name immediately when a product link is clicked", () => {
    document.body.innerHTML = `
      <a aria-label="Ceramic mug" href="https://www.temu.com/ca/ceramic-mug-g-123456789.html">
        <img alt="Ceramic mug" src="/mug.png">
      </a>
    `;
    window.history.replaceState({}, "", "https://www.temu.com/ca/channel/best-sellers.html");
    const events: DecisionEvent[] = [];
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: (event) => events.push(event),
      now: vi.fn(() => 1234),
    });

    recorder.start();
    document.querySelector("img")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true, composed: true }),
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "PRODUCT_CLICK",
      timestamp: 1234,
      productId: "temu:123456789",
      product: { name: "Ceramic mug" },
    });
    recorder.stop();
  });

  it("ignores links that are not Temu product detail URLs", () => {
    document.body.innerHTML = '<a href="https://www.temu.com/ca/about.html">About</a>';
    window.history.replaceState({}, "", "https://www.temu.com/ca/channel/best-sellers.html");
    const events: DecisionEvent[] = [];
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: (event) => events.push(event),
    });

    recorder.start();
    document.querySelector("a")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(events).toHaveLength(0);
    recorder.stop();
  });

  it("finishes the current view before opening another product link", () => {
    document.body.innerHTML = `
      <h1 class="_25g_jM0z">Product A</h1>
      <span data-testid="current-price">$19.99</span>
      <a aria-label="Product B" href="https://www.temu.com/ca/product-b-g-2.html">Product B</a>
    `;
    window.history.replaceState({}, "", "https://www.temu.com/ca/product-a-g-1.html");
    let now = 1000;
    const events: DecisionEvent[] = [];
    const recorder = new DecisionReplayRecorder({
      document,
      adapter: new TemuProductAdapter(),
      sendEvent: (event) => events.push(event),
      now: () => now,
    });

    recorder.start();
    now = 21_000;
    document.querySelector("a")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(events).toHaveLength(3);
    expect(events[1]).toMatchObject({
      action: "PRODUCT_VIEW",
      productId: "temu:1",
      durationMs: 20_000,
      leftAt: 21_000,
    });
    expect(events[2]).toMatchObject({
      action: "PRODUCT_CLICK",
      productId: "temu:2",
      product: { name: "Product B" },
    });
    recorder.stop();
  });
});
