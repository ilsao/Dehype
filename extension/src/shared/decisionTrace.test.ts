import { describe, expect, it } from "vitest";

import { createDecisionEvent, createDecisionSession } from "./decisionReplay";
import { buildDecisionTrace } from "./decisionTrace";

function view(productId: string, name: string, price: string, timestamp: number, durationMs: number) {
  return createDecisionEvent("PRODUCT_VIEW", timestamp, {
    productId,
    product: {
      productId,
      url: `https://www.temu.com/ca/${productId}-g-${productId}.html`,
      name,
      currentPrice: price,
      viewedAt: timestamp,
      ...(productId === "b"
        ? { persuasion: [{
            elemId: "scarcity-1",
            persuasionType: "scarcity",
            strength: "rule-detected" as const,
            originalText: "Only 3 left",
            neutralized: false,
          }] }
        : {}),
    },
    durationMs,
  });
}

describe("buildDecisionTrace", () => {
  it("computes deterministic journey metrics", () => {
    const session = createDecisionSession(1000);
    session.intent = { budget: "$30" };
    session.events = [
      view("a", "Product A", "$19.99", 1000, 20_000),
      view("b", "Product B", "$29.99", 21_000, 35_000),
      view("c", "Product C", "$49.99", 57_000, 15_000),
      view("b", "Product B", "$29.99", 73_000, 10_000),
      createDecisionEvent("ADD_TO_CART", 84_000, {
        productId: "b",
        product: {
          productId: "b",
          url: "https://www.temu.com/ca/b-g-b.html",
          name: "Product B",
          currentPrice: "$29.99",
          viewedAt: 73_000,
        },
      }),
    ];

    const trace = buildDecisionTrace(session);
    const productB = trace.products.find((product) => product.productId === "b");

    expect(trace.sequence).toEqual(["a", "b", "c", "b"]);
    expect(trace.totalDecisionTimeMs).toBe(80_000);
    expect(trace.comparisonCount).toBe(3);
    expect(trace.revisitCount).toBe(1);
    expect(trace.finalProductId).toBe("b");
    expect(trace.finalPrice).toBe(29.99);
    expect(trace.budgetAlignment).toMatchObject({ status: "within-budget", difference: 0.01 });
    expect(productB).toMatchObject({
      totalViewDurationMs: 45_000,
      viewCount: 2,
      attentionShare: 0.5625,
      addedToCart: true,
      persuasionSignals: ["scarcity"],
    });
    expect(trace.persuasionSignals).toEqual([
      { persuasionType: "scarcity", count: 2, productIds: ["b"] },
    ]);
  });

  it("does not invent a final choice or duration from incomplete data", () => {
    const session = createDecisionSession(1000);
    session.events = [
      createDecisionEvent("PRODUCT_VIEW", 1000, {
        productId: "unknown",
        product: { productId: "unknown", url: "https://example.test", name: "Unknown", viewedAt: 1000 },
      }),
      createDecisionEvent("CHECKOUT", 2000),
    ];

    expect(buildDecisionTrace(session)).toMatchObject({
      totalDecisionTimeMs: 0,
      comparisonCount: 0,
      revisitCount: 0,
    });
    expect(buildDecisionTrace(session).finalProductId).toBeUndefined();
  });
});