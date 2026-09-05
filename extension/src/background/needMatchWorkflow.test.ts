import { describe, expect, it, vi } from "vitest";

import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_VERSION,
} from "../shared/aiSettings.js";
import type { ProviderFetch } from "./aiProvider.js";
import { runNeedMatchWorkflow } from "./needMatchWorkflow.js";

const settings = {
  version: AI_SETTINGS_VERSION,
  state: "remote",
  provider: "openai",
  model: "gpt-test",
  apiKey: "key-test",
  consentVersion: AI_REMOTE_CONSENT_VERSION,
};
const userNeed = {
  minBudget: null,
  maxBudget: 100,
  mustHave: ["USB-C"],
  niceToHave: [],
  exclude: [],
};
const productValues = { name: "HOT Laptop", currentPrice: "$50" };
const validMatch = JSON.stringify({
  explanation: "The known facts meet the required criteria.",
  budget: { status: "matched", explanation: "The price is in range." },
  mustHave: [{ status: "unknown", explanation: "USB-C is not specified." }],
  niceToHave: [],
  exclude: [],
});

function providerResponse(outputText: string, ok = true) {
  return {
    ok,
    statusText: ok ? "OK" : "Bad Request",
    json: vi.fn(async () =>
      ok ? { output_text: outputText } : { error: { message: outputText } },
    ),
  };
}

function createStorage({
  includeSettings = true,
  includeUserNeed = true,
} = {}) {
  const values: Record<string, unknown> = {};

  if (includeSettings) values.aiSettings = settings;
  if (includeUserNeed) values.userNeed = userNeed;

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

describe("Need Match workflow", () => {
  it("stores analyzing and success states with saved provider settings", async () => {
    const storage = createStorage();
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse(validMatch),
    );

    await expect(
      runNeedMatchWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-1",
      }),
    ).resolves.toMatchObject({
      state: "success",
      analysisId: "analysis-1",
      result: { status: "unknown", productName: "HOT Laptop" },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(storage.values.needMatchAnalysis).toMatchObject({
      state: "success",
      analysisId: "analysis-1",
    });
    const request = fetchImpl.mock.calls[0]?.[1];
    expect(request?.body as string).toContain("USB-C");
    expect(request?.body as string).not.toContain('"id":');
    expect(request?.body as string).not.toContain("key-test");
  });

  it("stores an error without AI settings and does not call the provider", async () => {
    const storage = createStorage({ includeSettings: false });
    const fetchImpl = vi.fn<ProviderFetch>();

    await expect(
      runNeedMatchWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-2",
      }),
    ).resolves.toMatchObject({
      state: "error",
      message: expect.stringContaining("Open Dehype"),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(storage.values.needMatchAnalysis).toMatchObject({
      state: "error",
      analysisId: "analysis-2",
    });
  });

  it("stores an error without saved UserNeed and does not call the provider", async () => {
    const storage = createStorage({ includeUserNeed: false });
    const fetchImpl = vi.fn<ProviderFetch>();

    await expect(
      runNeedMatchWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-3",
      }),
    ).resolves.toMatchObject({
      state: "error",
      message: expect.stringContaining("Save your user needs"),
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("stores provider and malformed response errors", async () => {
    const providerErrorStorage = createStorage();
    await runNeedMatchWorkflow({
      productValues,
      storage: providerErrorStorage,
      fetchImpl: vi.fn<ProviderFetch>(async () =>
        providerResponse("Invalid key", false),
      ),
      createAnalysisId: () => "analysis-4",
    });
    expect(providerErrorStorage.values.needMatchAnalysis).toMatchObject({
      state: "error",
      message: expect.stringContaining("Invalid key"),
    });

    const malformedStorage = createStorage();
    await runNeedMatchWorkflow({
      productValues,
      storage: malformedStorage,
      fetchImpl: vi.fn<ProviderFetch>(async () => providerResponse("not json")),
      createAnalysisId: () => "analysis-5",
    });
    expect(malformedStorage.values.needMatchAnalysis).toMatchObject({
      state: "error",
      message: expect.stringContaining("invalid JSON"),
    });
  });

  it("does not restore a stale result after UserNeed edit clears analysis", async () => {
    const storage = createStorage();
    const fetchImpl = vi.fn<ProviderFetch>(async () => {
      delete storage.values.needMatchAnalysis;
      return providerResponse(validMatch);
    });

    await runNeedMatchWorkflow({
      productValues,
      storage,
      fetchImpl,
      createAnalysisId: () => "analysis-6",
    });

    expect(storage.values.needMatchAnalysis).toBeUndefined();
  });
});
