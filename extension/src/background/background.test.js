import { describe, expect, it, vi } from "vitest";

import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_KEY,
  AI_SETTINGS_VERSION,
} from "../shared/aiSettings.js";
import {
  analyzeNeedMatchWithSavedSettings,
  neutralizeWithSavedSettings,
} from "./background.js";

const productValues = {
  name: "HOT SALE Wireless Earbuds!",
  currentPrice: "$12.99 today only",
  stockAmount: "Only 3 left",
};

const remoteSettings = {
  version: AI_SETTINGS_VERSION,
  state: "remote",
  provider: "openai",
  model: "gpt-test",
  apiKey: "key",
  consentVersion: AI_REMOTE_CONSENT_VERSION,
};

const savedUserNeed = {
  minBudget: 0,
  maxBudget: 100,
  mustHave: ["wireless"],
  niceToHave: [],
  exclude: [],
};

function storage(settings, extraValues = {}) {
  const values = {
    ...(settings ? { [AI_SETTINGS_KEY]: settings } : {}),
    ...extraValues,
  };
  return {
    values,
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (items) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (key) => {
      delete values[key];
    }),
  };
}

describe("background neutralization coordinator", () => {
  it("preserves original values for structural cleanup without AI settings", async () => {
    await expect(
      neutralizeWithSavedSettings(productValues, { storage: storage() }),
    ).resolves.toEqual({
      productValues: {
        name: "HOT SALE Wireless Earbuds!",
        currentPrice: "$12.99 today only",
        stockAmount: "Only 3 left",
      },
      source: "structural",
      fallbackReason: "Open Dehype and save your AI provider, model, and API key.",
    });
  });

  it("returns a validated model result after consent", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: '{"name":"Wireless Earbuds"}' }),
    }));
    await expect(
      neutralizeWithSavedSettings(productValues, {
        storage: storage(remoteSettings),
        fetchImpl,
      }),
    ).resolves.toEqual({
      productValues: {
        name: "Wireless Earbuds",
        currentPrice: "$12.99 today only",
        stockAmount: "Only 3 left",
      },
      source: "model",
    });
  });

  it("does not let model output alter local price or image facts", async () => {
    const factualValues = {
      ...productValues,
      originalPrice: "CA$9.04",
      currentPrice: "Estimated CA$4.64",
      image: "https://example.test/pliers.png",
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          name: "Pliers",
          originalPrice: "CA$99.99",
          currentPrice: "CA$0.01",
          image: "https://evil.invalid/replacement.png",
        }),
      }),
    }));
    const result = await neutralizeWithSavedSettings(factualValues, {
      storage: storage(remoteSettings),
      fetchImpl,
    });

    expect(result.productValues).toMatchObject({
      originalPrice: "CA$9.04",
      currentPrice: "Estimated CA$4.64",
      image: "https://example.test/pliers.png",
    });
  });

  it("falls back to unchanged values when a model response is malformed", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: "not json" }),
    }));
    const result = await neutralizeWithSavedSettings(productValues, {
      storage: storage(remoteSettings),
      fetchImpl,
    });
    expect(result).toMatchObject({
      productValues: {
        name: "HOT SALE Wireless Earbuds!",
        currentPrice: "$12.99 today only",
        stockAmount: "Only 3 left",
      },
      source: "structural",
    });
    expect(result.fallbackReason).toContain("invalid JSON");
  });

  it("does not trigger Need Match storage writes during Neutralize", async () => {
    const testStorage = storage(remoteSettings, { userNeed: savedUserNeed });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: '{"name":"Wireless Earbuds"}' }),
    }));

    await neutralizeWithSavedSettings(productValues, {
      storage: testStorage,
      fetchImpl,
    });

    expect(testStorage.values.needMatchAnalysis).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("runs Need Match only through the dedicated message coordinator", async () => {
    const testStorage = storage(remoteSettings, { userNeed: savedUserNeed });
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          explanation: "The product facts can be compared with the saved needs.",
          budget: {
            status: "matched",
            explanation: "The price is in range.",
          },
          mustHave: [
            {
              status: "matched",
              explanation: "Wireless is in the product name.",
            },
          ],
          niceToHave: [],
          exclude: [],
        }),
      }),
    }));

    await expect(
      analyzeNeedMatchWithSavedSettings(productValues, {
        storage: testStorage,
        fetchImpl,
        createAnalysisId: () => "background-analysis-1",
      }),
    ).resolves.toEqual({
      type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES_RESULT",
      ok: true,
    });
    expect(testStorage.values.needMatchAnalysis).toMatchObject({
      state: "success",
      analysisId: "background-analysis-1",
      result: { status: "matched" },
    });
  });
});
