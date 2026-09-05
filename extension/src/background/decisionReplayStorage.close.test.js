import { describe, expect, it } from "vitest";

import {
  finishDecisionViewsForTab,
} from "./decisionReplayStorage.js";
import { createDecisionEvent } from "../shared/decisionReplay.ts";

function createStorage(initialSession) {
  let value = initialSession;
  return {
    get: async () => ({ decisionReplaySession: value }),
    set: async (next) => {
      value = next.decisionReplaySession;
    },
  };
}

describe("Decision Replay tab close handling", () => {
  it("finishes an unfinished view when its tab is removed", async () => {
    const event = createDecisionEvent("PRODUCT_VIEW", 1_000, {
      tabId: 7,
      productId: "temu:7",
    });
    const session = {
      version: 1,
      sessionId: "session-1",
      startedAt: 1_000,
      events: [event],
    };
    const storage = createStorage(session);

    const result = await finishDecisionViewsForTab(7, 21_000, storage);

    expect(result.events).toEqual([
      { ...event, leftAt: 21_000, durationMs: 20_000 },
    ]);
  });

  it("does not finish another tab or an already completed view", async () => {
    const otherTab = createDecisionEvent("PRODUCT_VIEW", 1_000, {
      tabId: 8,
      productId: "temu:8",
    });
    const completed = createDecisionEvent("PRODUCT_VIEW", 2_000, {
      tabId: 7,
      productId: "temu:7",
      leftAt: 4_000,
      durationMs: 2_000,
    });
    const session = {
      version: 1,
      sessionId: "session-1",
      startedAt: 1_000,
      events: [otherTab, completed],
    };

    const result = await finishDecisionViewsForTab(7, 21_000, createStorage(session));

    expect(result.events).toEqual([otherTab, completed]);
  });
});