import { describe, expect, it } from "vitest";

import { analyzeDecisionReplay, parseDecisionAnalysis } from "./decisionReplayAnalysis.js";

describe("Decision Replay structured analysis", () => {
  it("parses structured reflection fields and drops malformed insight items", () => {
    const result = parseDecisionAnalysis(JSON.stringify({
      summary: "You explored two products.",
      journeyInsights: [
        { title: "Revisit", observation: "Product B was revisited.", productId: "b" },
        { title: "invalid" },
      ],
      attentionInsights: [{ productId: "b", observation: "Product B received most attention." }],
      potentialInfluences: [{ persuasionType: "scarcity", observation: "It coincided with the revisit." }],
      reflection: ["Compare the final choice with your budget."],
      uncertainty: ["The replay cannot establish causation."],
    }));

    expect(result).toEqual({
      summary: "You explored two products.",
      journeyInsights: [{ title: "Revisit", observation: "Product B was revisited.", productId: "b" }],
      attentionInsights: [{ productId: "b", observation: "Product B received most attention." }],
      potentialInfluences: [{ persuasionType: "scarcity", observation: "It coincided with the revisit." }],
      reflection: ["Compare the final choice with your budget."],
      uncertainty: ["The replay cannot establish causation."],
    });
  });

  it("rejects analysis without a summary", () => {
    expect(() => parseDecisionAnalysis('{"reflection":[]}')).toThrow("missing a summary");
  });

  it("returns an unavailable result when Gemini fails without throwing", async () => {
    const result = await analyzeDecisionReplay(
      { version: 1, sessionId: "session", startedAt: 1, events: [] },
      {
        storage: {
          get: async () => ({
            aiSettings: {
              version: 2,
              state: "remote",
              provider: "gemini",
              model: "gemini-test",
              apiKey: "test-key",
              consentVersion: 1,
            },
          }),
          set: async () => {},
        },
        fetchImpl: async () => ({
          ok: false,
          statusText: "Bad Gateway",
          json: async () => ({ error: { message: "temporary failure" } }),
        }),
      },
    );

    expect(result).toMatchObject({ ok: false, message: "temporary failure" });
    expect(result.payload.trace.totalDecisionTimeMs).toBe(0);
  });
});