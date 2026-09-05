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
  });

  it("rejects malformed persisted sessions", () => {
    expect(isDecisionSession({ version: 1, sessionId: "x", startedAt: 1, events: [{ action: "NOPE" }] })).toBe(false);
  });
});