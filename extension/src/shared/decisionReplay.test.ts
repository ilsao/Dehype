import {
  buildReplayAnalysisPayload,
  createDecisionEvent,
  createDecisionSession,
  isDecisionSession,
  productSnapshotFromInfo,
} from "./decisionReplay";
import { describe, expect, it } from "vitest";

describe("Decision Replay model", () => {
  it("derives a stable Temu product id from the existing product URL", () => {
    const snapshot = productSnapshotFromInfo(
      "https://www.temu.com/ca/mug-g-12345.html",
      { name: { id: "name-id", value: "Mug" }, currentPrice: { id: "price-id", value: "$19" } },
      100,
    );

    expect(snapshot).toMatchObject({
      productId: "temu:12345",
      name: "Mug",
      currentPrice: "$19",
      viewedAt: 100,
    });
  });

  it("preserves optional product facts and persuasion context", () => {
    const snapshot = productSnapshotFromInfo(
      "https://www.temu.com/ca/mug-g-12345.html",
      {
        name: { id: "name-id", value: "Mug" },
        currentPrice: { id: "current-id", value: "$19" },
        originalPrice: { id: "original-id", value: "$29" },
        discount: { id: "discount-id", value: "34% OFF" },
        stockAmount: { id: "stock-id", value: "Only 3 left" },
        description: { id: "description-id", value: "Ceramic mug" },
        image: { id: "image-id", value: "https://example.test/mug.png" },
      },
      100,
      [
        {
          elemId: "persuasion-id",
          persuasionType: "countdown",
          strength: "rule-detected",
          originalText: "Limited time",
          neutralized: true,
        },
      ],
    );

    expect(snapshot).toMatchObject({
      discount: "34% OFF",
      stockAmount: "Only 3 left",
      description: "Ceramic mug",
      image: "https://example.test/mug.png",
      persuasion: [{ persuasionType: "countdown", neutralized: true }],
    });
  });

  it("compresses repeated product views and actions without losing sequence", () => {
    const session = createDecisionSession(100);
    const products = [
      ["a", "A", "$19"],
      ["b", "B", "$29"],
      ["c", "C", "$49"],
      ["b", "B", "$29"],
      ["c", "C", "$49"],
    ] as const;
    session.events = products.map(([productId, name, price], index) =>
      createDecisionEvent("PRODUCT_VIEW", 1000 + index * 1000, {
        productId,
        product: {
          productId,
          url: `https://temu.com/${productId}-g-${index + 1}.html`,
          name,
          currentPrice: price,
          viewedAt: 1000 + index * 1000,
        },
        durationMs: 25000 + index * 1000,
      }),
    );
    session.events.push(
      createDecisionEvent("ADD_TO_CART", 6000, { productId: "c" }),
    );

    const payload = buildReplayAnalysisPayload(session);
    expect(payload.viewSequence).toEqual(["a", "b", "c", "b", "c"]);
    expect(payload.userActions).toEqual([
      { action: "ADD_TO_CART", productId: "c", timestamp: 6000 },
    ]);
    expect(payload.products).toHaveLength(3);
    expect(payload.products.find((product) => product.productId === "c")?.totalViewDurationMs).toBe(56000);
    expect(payload.products.find((product) => product.productId === "c")?.currentPrice).toBe("$49");
  });

  it("includes optional product context in the analysis payload", () => {
    const session = createDecisionSession(100);
    const product = productSnapshotFromInfo(
      "https://www.temu.com/ca/mug-g-9.html",
      {
        name: { id: "name", value: "Mug" },
        currentPrice: { id: "current", value: "$19" },
        discount: { id: "discount", value: "34% OFF" },
        stockAmount: { id: "stock", value: "Only 3 left" },
      },
      100,
    );
    session.events = [
      createDecisionEvent("PRODUCT_VIEW", 100, {
        productId: product.productId,
        product,
        durationMs: 2_000,
      }),
    ];

    const payload = buildReplayAnalysisPayload(session);

    expect(payload.products).toEqual([
      expect.objectContaining({
        productId: "temu:9",
        name: "Mug",
        currentPrice: "$19",
        discount: "34% OFF",
        stockAmount: "Only 3 left",
        totalViewDurationMs: 2_000,
      }),
    ]);
  });

  it("rejects malformed persisted sessions", () => {
    expect(isDecisionSession({ version: 1, sessionId: "x", startedAt: 1, events: [{ action: "NOPE" }] })).toBe(false);
  });
});