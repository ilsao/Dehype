import { describe, expect, it, vi } from "vitest";

import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_KEY,
  AI_SETTINGS_VERSION,
} from "../shared/aiSettings.js";
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
      fallbackReason: "Configure and consent to an AI provider to analyze product wording.",
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
          version: AI_SETTINGS_VERSION,
          state: "remote",
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
      storage: storage({
        version: AI_SETTINGS_VERSION,
        state: "remote",
        provider: "openai",
        model: "gpt-test",
        apiKey: "key",
        consentVersion: AI_REMOTE_CONSENT_VERSION,
      }),
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
      storage: storage({
        version: AI_SETTINGS_VERSION,
        state: "remote",
        provider: "openai",
        model: "gpt-test",
        apiKey: "key",
        consentVersion: AI_REMOTE_CONSENT_VERSION,
      }),
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
});
