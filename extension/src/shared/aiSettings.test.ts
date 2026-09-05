import { describe, expect, it, vi } from "vitest";

import {
  AI_SETTINGS_KEY,
  defaultModelForProvider,
  getAiSettingsStatus,
  loadAiSettings,
  saveAiSettings,
  validateAiSettings,
} from "./aiSettings.js";

describe("AI settings", () => {
  it("saves and reloads the provider, model, and API key", async () => {
    const values: Record<string, unknown> = {};
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

  it("reports healthy only when complete AI settings are stored", async () => {
    const configuredStorage = {
      get: vi.fn(async () => ({
        [AI_SETTINGS_KEY]: {
          provider: "openai",
          model: "gpt-4.1-mini",
          apiKey: "test-key",
        },
      })),
    };
    const emptyStorage = { get: vi.fn(async () => ({})) };

    await expect(getAiSettingsStatus(configuredStorage)).resolves.toEqual({
      healthy: true,
      configured: true,
    });
    await expect(getAiSettingsStatus(emptyStorage)).resolves.toEqual({
      healthy: false,
      configured: false,
    });
  });

  it("reports unhealthy for invalid settings or storage failures", async () => {
    const invalidStorage = {
      get: vi.fn(async () => ({
        [AI_SETTINGS_KEY]: {
          provider: "gemini",
          model: "",
          apiKey: "test-key",
        },
      })),
    };
    const failingStorage = {
      get: vi.fn(async () => {
        throw new Error("Storage unavailable");
      }),
    };

    await expect(getAiSettingsStatus(invalidStorage)).resolves.toEqual({
      healthy: false,
      configured: false,
    });
    await expect(getAiSettingsStatus(failingStorage)).resolves.toEqual({
      healthy: false,
      configured: false,
    });
  });
});
