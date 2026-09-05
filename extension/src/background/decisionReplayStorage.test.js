import { describe, expect, it } from "vitest";

import {
  appendDecisionEvent,
  loadDecisionSession,
} from "./decisionReplayStorage.js";
import { createDecisionEvent } from "../shared/decisionReplay.ts";

function createStorage() {
  let value;
  return {
    get: async () => ({ decisionReplaySession: value }),
    set: async (next) => {
      value = next.decisionReplaySession;
    },
  };
}

describe("Decision Replay storage", () => {
  it("updates an existing event when its duration is completed", async () => {
    const storage = createStorage();
    const first = createDecisionEvent("PRODUCT_VIEW", 1000, {
      productId: "temu:1",
      product: {
        productId: "temu:1",
        url: "https://www.temu.com/ca/mug-g-1.html",
        name: "Mug",
        viewedAt: 1000,
      },
    });
    const completed = { ...first, leftAt: 5000, durationMs: 4000 };

    await appendDecisionEvent(first, storage);
    const session = await appendDecisionEvent(completed, storage);

    expect(session.events).toHaveLength(1);
    expect(session.events[0]).toMatchObject({
      id: first.id,
      durationMs: 4000,
      leftAt: 5000,
    });
    expect(await loadDecisionSession(storage)).toEqual(session);
  });
});