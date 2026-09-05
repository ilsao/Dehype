import { describe, expect, it, vi } from "vitest";

import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_KEY,
  AI_SETTINGS_VERSION,
  defaultModelForProvider,
  getAiSettingsStatus,
  loadAiSettings,
  requestProviderPermission,
  revokeUnusedProviderPermissions,
  saveAiSettings,
  validateAiSettings,
} from "./aiSettings.js";

function storageWith(initial: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { ...initial };
  return {
    values,
    get: vi.fn(async () => values),
    set: vi.fn(async (next: Record<string, unknown>) =>
      Object.assign(values, next),
    ),
    remove: vi.fn(async (key: string) => {
      delete values[key];
    }),
  };
}

describe("AI settings", () => {
  it("defaults to unconfigured structural cleanup", () => {
    expect(validateAiSettings(undefined)).toEqual({
      version: AI_SETTINGS_VERSION,
      state: "unconfigured",
    });
  });

  it("requires explicit current consent for remote mode", () => {
    expect(() =>
      validateAiSettings({
        version: AI_SETTINGS_VERSION,
        state: "remote",
        provider: "openai",
        model: "gpt-test",
        apiKey: "key",
      }),
    ).toThrow("Consent is required");
  });

  it("saves and reloads consented remote settings", async () => {
    const storage = storageWith();
    const settings = {
      version: AI_SETTINGS_VERSION,
      state: "remote",
      provider: "gemini",
      model: " gemini-3.5-flash-lite ",
      apiKey: " test-key ",
      consentVersion: AI_REMOTE_CONSENT_VERSION,
    };

    await saveAiSettings(storage, settings);

    await expect(loadAiSettings(storage)).resolves.toEqual({
      ...settings,
      model: "gemini-3.5-flash-lite",
      apiKey: "test-key",
    });
  });

  it("migrates legacy local credentials without inferring consent", async () => {
    const storage = storageWith({
      [AI_SETTINGS_KEY]: {
        provider: "openai",
        model: "gpt-4.1-mini",
        apiKey: "key",
      },
    });

    await expect(loadAiSettings(storage)).resolves.toEqual({
      version: AI_SETTINGS_VERSION,
      state: "unconfigured",
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "key",
    });
    expect(storage.set).toHaveBeenCalled();
  });

  it("migrates consented legacy remote settings", async () => {
    const storage = storageWith({
      [AI_SETTINGS_KEY]: {
        version: 1,
        mode: "remote",
        provider: "gemini",
        model: "gemini-3.5-flash-lite",
        apiKey: "key",
        consentVersion: AI_REMOTE_CONSENT_VERSION,
      },
    });

    await expect(loadAiSettings(storage)).resolves.toEqual({
      version: AI_SETTINGS_VERSION,
      state: "remote",
      provider: "gemini",
      model: "gemini-3.5-flash-lite",
      apiKey: "key",
      consentVersion: AI_REMOTE_CONSENT_VERSION,
    });
  });

  it("resets only malformed settings", async () => {
    const storage = storageWith({
      [AI_SETTINGS_KEY]: { version: 99, mode: "remote" },
      unrelated: "preserved",
    });

    await expect(loadAiSettings(storage)).resolves.toEqual({
      version: AI_SETTINGS_VERSION,
      state: "unconfigured",
    });
    expect(storage.remove).toHaveBeenCalledWith(AI_SETTINGS_KEY);
    expect(storage.values.unrelated).toBe("preserved");
  });

  it("reports status from complete local remote settings", async () => {
    const storage = storageWith({
      [AI_SETTINGS_KEY]: {
        version: AI_SETTINGS_VERSION,
        state: "remote",
        provider: "openai",
        model: "gpt-test",
        apiKey: "key",
        consentVersion: AI_REMOTE_CONSENT_VERSION,
      },
    });

    await expect(getAiSettingsStatus(storage)).resolves.toEqual({
      healthy: true,
      configured: true,
    });
  });

  it("reports unhealthy status when settings are missing or unreadable", async () => {
    await expect(getAiSettingsStatus(storageWith())).resolves.toEqual({
      healthy: false,
      configured: false,
    });

    await expect(
      getAiSettingsStatus({
        get: vi.fn(async () => {
          throw new Error("storage failed");
        }),
        set: vi.fn(),
      }),
    ).resolves.toEqual({ healthy: false, configured: false });
  });

  it("requests only the selected provider origin", async () => {
    const permissions = { request: vi.fn(async () => true) };

    await expect(
      requestProviderPermission(permissions, "claude"),
    ).resolves.toBe(true);
    expect(permissions.request).toHaveBeenCalledWith({
      origins: ["https://api.anthropic.com/*"],
    });
  });

  it("removes provider grants that are not in active use", async () => {
    const permissions = { remove: vi.fn(async () => true) };

    await revokeUnusedProviderPermissions(permissions, "openai");

    expect(permissions.remove).toHaveBeenCalledWith({
      origins: [
        "https://generativelanguage.googleapis.com/*",
        "https://api.anthropic.com/*",
      ],
    });
  });

  it("provides a default model for every provider", () => {
    expect(defaultModelForProvider("openai")).toBe("gpt-4.1-mini");
    expect(defaultModelForProvider("gemini")).toBe("gemini-3.5-flash-lite");
    expect(defaultModelForProvider("claude")).toBe(
      "claude-3-5-haiku-latest",
    );
  });
});
