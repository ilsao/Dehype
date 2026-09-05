import { describe, expect, it, vi } from "vitest";

import {
  AI_SETTINGS_KEY,
  defaultModelForProvider,
  loadAiSettings,
  saveAiSettings,
  validateAiSettings,
} from "./aiSettings.js";

describe("AI settings", () => {
  it("saves and reloads the provider, model, and API key", async () => {
    const values = {};
    const storage = {
      get: vi.fn(async () => values),
      set: vi.fn(async (nextValues) => Object.assign(values, nextValues)),
    };

    await saveAiSettings(storage, {
      provider: "gemini",
      model: " gemini-3.5-flash-lite ",
      apiKey: " test-key ",
    });

    expect(values[AI_SETTINGS_KEY]).toEqual({
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      apiKey: "test-key",
    });
    await expect(loadAiSettings(storage)).resolves.toEqual(
      values[AI_SETTINGS_KEY],
    );
  });

  it("validates every supported provider", () => {
    for (const provider of ["openai", "gemini", "claude"]) {
      expect(
        validateAiSettings({ provider, model: "model", apiKey: "key" }),
      ).toEqual({ provider, model: "model", apiKey: "key" });
    }
  });

  it("rejects incomplete settings", () => {
    expect(() =>
      validateAiSettings({ provider: "gemini", model: "", apiKey: "key" }),
    ).toThrow("Enter a model name.");
    expect(() =>
      validateAiSettings({ provider: "gemini", model: "model", apiKey: "" }),
    ).toThrow("Enter an API key.");
  });

  it("provides a default model for each provider", () => {
    expect(defaultModelForProvider("openai")).toBe("gpt-4.1-mini");
    expect(defaultModelForProvider("gemini")).toBe(
      "gemini-3.5-flash-lite",
    );
    expect(defaultModelForProvider("claude")).toBe(
      "claude-3-5-haiku-latest",
    );
  });
});
