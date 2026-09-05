import { describe, expect, it, vi } from "vitest";

import { AI_REMOTE_CONSENT_VERSION, AI_SETTINGS_KEY } from "../shared/aiSettings.js";
import { neutralizeWithSavedSettings } from "./background.js";

const productValues = {
  name: "HOT SALE Wireless Earbuds!",
  currentPrice: "$12.99 today only",
  stockAmount: "Only 3 left",
};

function storage(settings) {
  return {
    get: vi.fn(async () => (settings ? { [AI_SETTINGS_KEY]: settings } : {})),
    set: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
  };
}

describe("background neutralization coordinator", () => {
  it("works locally without any AI settings", async () => {
    await expect(
      neutralizeWithSavedSettings(productValues, { storage: storage() }),
    ).resolves.toEqual({
      productValues: {
        name: "Wireless Earbuds",
        currentPrice: "$12.99",
        stockAmount: "Listed stock quantity: 3",
      },
      source: "local",
    });
  });

  it("returns a validated model result after consent", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: '{"name":"Wireless Earbuds"}' }),
    }));
    await expect(
      neutralizeWithSavedSettings(productValues, {
        storage: storage({
          version: 1,
          mode: "remote",
          provider: "openai",
          model: "gpt-test",
          apiKey: "key",
          consentVersion: AI_REMOTE_CONSENT_VERSION,
        }),
        fetchImpl,
      }),
    ).resolves.toEqual({
      productValues: {
        name: "Wireless Earbuds",
        currentPrice: "$12.99",
        stockAmount: "Listed stock quantity: 3",
      },
      source: "model",
    });
  });

  it("falls back to local rules when a model response is malformed", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: "not json" }),
    }));
    const result = await neutralizeWithSavedSettings(productValues, {
      storage: storage({
        version: 1,
        mode: "remote",
        provider: "openai",
        model: "gpt-test",
        apiKey: "key",
        consentVersion: AI_REMOTE_CONSENT_VERSION,
      }),
      fetchImpl,
    });
    expect(result).toMatchObject({
      productValues: {
        name: "Wireless Earbuds",
        currentPrice: "$12.99",
      },
      source: "local",
    });
    expect(result.fallbackReason).toContain("invalid JSON");
  });
});
