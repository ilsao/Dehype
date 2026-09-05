import { describe, expect, it, vi } from "vitest";

import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_VERSION,
} from "../shared/aiSettings.js";
import type { ProviderFetch } from "./aiProvider.js";
import { runNeutralizeWorkflow } from "./neutralizeWorkflow.js";

const settings = {
  version: AI_SETTINGS_VERSION,
  state: "remote",
  provider: "openai",
  model: "gpt-test",
  apiKey: "key-test",
  consentVersion: AI_REMOTE_CONSENT_VERSION,
};
const productValues = { name: "HOT Laptop", currentPrice: "$50" };

function providerResponse(outputText: string, ok = true) {
  return {
    ok,
    statusText: ok ? "OK" : "Bad Request",
    json: vi.fn(async () =>
      ok ? { output_text: outputText } : { error: { message: outputText } },
    ),
  };
}

function createStorage(settingsValue: unknown = settings) {
  const values: Record<string, unknown> = settingsValue
    ? { aiSettings: settingsValue }
    : {};

  return {
    values,
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete values[key];
    }),
  };
}

describe("neutralize workflow", () => {
  it("uses saved AI settings to neutralize product values only", async () => {
    const storage = createStorage();
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse('{"name":"Laptop"}'),
    );

    await expect(
      runNeutralizeWorkflow({ productValues, storage, fetchImpl }),
    ).resolves.toEqual({ name: "Laptop" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(storage.values.needMatchAnalysis).toBeUndefined();
  });

  it("rejects missing remote settings without writing Need Match state", async () => {
    const storage = createStorage(null);
    const fetchImpl = vi.fn<ProviderFetch>();

    await expect(
      runNeutralizeWorkflow({ productValues, storage, fetchImpl }),
    ).rejects.toThrow("Open Dehype and save your AI provider");

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storage.values.needMatchAnalysis).toBeUndefined();
  });
});
