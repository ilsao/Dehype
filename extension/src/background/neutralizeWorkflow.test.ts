import { describe, expect, it, vi } from "vitest";

import type { ProviderFetch } from "./aiProvider.js";
import { runNeutralizeWorkflow } from "./neutralizeWorkflow.js";

const settings = { provider: "openai", model: "gpt-test", apiKey: "key-test" };
const userNeed = {
  minBudget: null,
  maxBudget: 100,
  mustHave: ["USB-C"],
  niceToHave: [],
  exclude: [],
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

function createStorage(includeUserNeed = true) {
  const values: Record<string, unknown> = { aiSettings: settings };

  if (includeUserNeed) {
    values.userNeed = userNeed;
  }

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

const validMatch = JSON.stringify({
  explanation: "The known facts meet the required criteria.",
  budget: { status: "matched", explanation: "The price is in range." },
  mustHave: [{ status: "unknown", explanation: "USB-C is not specified." }],
  niceToHave: [],
  exclude: [],
});

describe("neutralize and Need Match workflow", () => {
  it("runs the requests sequentially and stores the Need Match result", async () => {
    const storage = createStorage();
    const fetchImpl = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(providerResponse(validMatch))
      .mockImplementationOnce(async () => {
        expect(storage.values.needMatchAnalysis).toMatchObject({
          state: "success",
          analysisId: "analysis-1",
        });
        return providerResponse('{"name":"Laptop"}');
      });

    await expect(
      runNeutralizeWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-1",
      }),
    ).resolves.toEqual({ name: "Laptop" });

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(storage.values.needMatchAnalysis).toMatchObject({
      state: "success",
      analysisId: "analysis-1",
      result: { status: "unknown", productName: "HOT Laptop" },
    });
    const firstRequest = fetchImpl.mock.calls[0]?.[1];
    expect(firstRequest?.body as string).toContain("USB-C");
    expect(firstRequest?.body as string).not.toContain('"id":');
  });

  it("skips Need Match without saved needs but still neutralizes", async () => {
    const storage = createStorage(false);
    const fetchImpl = vi.fn<ProviderFetch>(async () => {
      expect(storage.values.needMatchAnalysis).toMatchObject({
        state: "error",
        message: expect.stringContaining("Save your user needs"),
      });
      return providerResponse('{"name":"Laptop"}');
    });

    await expect(
      runNeutralizeWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-2",
      }),
    ).resolves.toEqual({ name: "Laptop" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(storage.values.needMatchAnalysis).toMatchObject({
      state: "error",
      message: expect.stringContaining("Save your user needs"),
    });
  });

  it("keeps neutralized values when Need Match is malformed", async () => {
    const storage = createStorage();
    const fetchImpl = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(providerResponse("not json"))
      .mockImplementationOnce(async () => {
        expect(storage.values.needMatchAnalysis).toMatchObject({
          state: "error",
          message: expect.stringContaining("invalid JSON"),
        });
        return providerResponse('{"name":"Laptop"}');
      });

    await expect(
      runNeutralizeWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-3",
      }),
    ).resolves.toEqual({ name: "Laptop" });
    expect(storage.values.needMatchAnalysis).toMatchObject({
      state: "error",
      message: expect.stringContaining("invalid JSON"),
    });
  });

  it("rejects neutralize failures", async () => {
    const storage = createStorage();
    const fetchImpl = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(providerResponse(validMatch))
      .mockResolvedValueOnce(providerResponse("Invalid key", false));

    await expect(
      runNeutralizeWorkflow({
        productValues,
        storage,
        fetchImpl,
        createAnalysisId: () => "analysis-4",
      }),
    ).rejects.toThrow("Provider request failed: Invalid key");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(storage.values.needMatchAnalysis).toMatchObject({
      state: "success",
      analysisId: "analysis-4",
    });
  });

  it("does not restore a result after Edit clears the analysis", async () => {
    const storage = createStorage();
    const fetchImpl = vi
      .fn<ProviderFetch>()
      .mockImplementationOnce(async () => {
        delete storage.values.needMatchAnalysis;
        return providerResponse(validMatch);
      })
      .mockResolvedValueOnce(providerResponse('{"name":"Laptop"}'));

    await runNeutralizeWorkflow({
      productValues,
      storage,
      fetchImpl,
      createAnalysisId: () => "analysis-5",
    });

    expect(storage.values.needMatchAnalysis).toBeUndefined();
  });
});
