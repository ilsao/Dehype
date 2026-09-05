import { describe, expect, it, vi } from "vitest";

import {
  analyzeNeedMatch,
  neutralizeProductValues,
  parseNeedMatchResult,
  parseNeutralizedValues,
} from "./aiProvider.js";
import type { ProviderFetch } from "./aiProvider.js";

const productValues = {
  name: "HOT SALE Wireless Earbuds!",
  currentPrice: "$12.99 today only",
  stockAmount: "Only 3 left",
};

const userNeed = {
  minBudget: 10,
  maxBudget: 50,
  mustHave: ["USB-C"],
  niceToHave: ["Quiet fan"],
  exclude: ["Subscription"],
};

const needMatchResponse = {
  explanation: "The available facts satisfy the required criteria.",
  budget: { status: "matched", explanation: "The price is within budget." },
  mustHave: [{ status: "matched", explanation: "USB-C is listed." }],
  niceToHave: [{ status: "mismatched", explanation: "Noise is not discussed." }],
  exclude: [{ status: "matched", explanation: "No subscription is listed." }],
};

function providerResponse(data: unknown, ok = true) {
  return {
    ok,
    statusText: ok ? "OK" : "Bad Request",
    json: vi.fn(async () => data),
  };
}

describe("AI provider requests", () => {
  it("uses the selected OpenAI model and key", async () => {
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse({
        output_text: JSON.stringify({
          name: "Wireless Earbuds",
          currentPrice: "$12.99",
        }),
      }),
    );

    await expect(
      neutralizeProductValues({
        settings: { provider: "openai", model: "gpt-test", apiKey: "key-o" },
        productValues,
        fetchImpl,
      }),
    ).resolves.toEqual({ name: "Wireless Earbuds", currentPrice: "$12.99" });

    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(new Headers(request.headers).get("authorization")).toBe(
      "Bearer key-o",
    );
    expect(JSON.parse(request.body as string).model).toBe("gpt-test");
    expect(request.body as string).not.toContain("id");
  });

  it("uses the selected Gemini model and key", async () => {
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse({
        candidates: [
          {
            content: {
              parts: [{ text: '{"name":"Wireless Earbuds"}' }],
            },
          },
        ],
      }),
    );

    await neutralizeProductValues({
      settings: {
        provider: "gemini",
        model: "gemini-test",
        apiKey: "key-g",
      },
      productValues,
      fetchImpl,
    });

    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(url).toContain("models/gemini-test:generateContent");
    expect(new Headers(request.headers).get("x-goog-api-key")).toBe("key-g");
    expect(JSON.parse(request.body as string).generationConfig).toEqual({
      responseMimeType: "application/json",
    });
  });

  it("uses the selected Claude model and key", async () => {
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse({
        content: [{ text: '{"name":"Wireless Earbuds"}' }],
      }),
    );

    await neutralizeProductValues({
      settings: {
        provider: "claude",
        model: "claude-test",
        apiKey: "key-c",
      },
      productValues,
      fetchImpl,
    });

    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const headers = new Headers(request.headers);
    expect(headers.get("x-api-key")).toBe("key-c");
    expect(headers.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(JSON.parse(request.body as string).model).toBe("claude-test");
  });

  it("surfaces provider errors", async () => {
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse({ error: { message: "Invalid API key" } }, false),
    );

    await expect(
      neutralizeProductValues({
        settings: { provider: "openai", model: "gpt-test", apiKey: "bad" },
        productValues,
        fetchImpl,
      }),
    ).rejects.toThrow("Provider request failed: Invalid API key");
  });

  it.each([
    {
      provider: "openai" as const,
      model: "gpt-match",
      apiKey: "match-o",
      data: { output_text: JSON.stringify(needMatchResponse) },
      header: "authorization",
      headerValue: "Bearer match-o",
    },
    {
      provider: "gemini" as const,
      model: "gemini-match",
      apiKey: "match-g",
      data: {
        candidates: [{ content: { parts: [{ text: JSON.stringify(needMatchResponse) }] } }],
      },
      header: "x-goog-api-key",
      headerValue: "match-g",
    },
    {
      provider: "claude" as const,
      model: "claude-match",
      apiKey: "match-c",
      data: { content: [{ text: JSON.stringify(needMatchResponse) }] },
      header: "x-api-key",
      headerValue: "match-c",
    },
  ])("uses saved $provider settings for Need Match", async (testCase) => {
    const fetchImpl = vi.fn<ProviderFetch>(async () =>
      providerResponse(testCase.data),
    );

    await expect(
      analyzeNeedMatch({
        settings: {
          provider: testCase.provider,
          model: testCase.model,
          apiKey: testCase.apiKey,
        },
        productValues: { ...productValues, domId: "dom-node-id" },
        userNeed,
        fetchImpl,
      }),
    ).resolves.toMatchObject({ status: "matched", productName: productValues.name });

    const [url, request] = fetchImpl.mock.calls[0]!;
    expect(new Headers(request.headers).get(testCase.header)).toBe(
      testCase.headerValue,
    );
    expect(`${url} ${request.body as string}`).toContain(testCase.model);
    expect(request.body as string).toContain("USB-C");
    expect(request.body as string).not.toContain("dom-node-id");
    expect(request.body as string).not.toContain(testCase.apiKey);
  });
});

describe("AI response parsing", () => {
  it("accepts fenced JSON and ignores fields absent from ProductInfo", () => {
    expect(
      parseNeutralizedValues(
        '```json\n{"name":"Wireless Earbuds","discount":"20%"}\n```',
        productValues,
      ),
    ).toEqual({ name: "Wireless Earbuds" });
  });

  it("rejects malformed or unusable responses", () => {
    const legacyOriginalPrice = ["origin", "Prize"].join("");
    const legacyCurrentPrice = ["real", "Prize"].join("");

    expect(() => parseNeutralizedValues("not json", productValues)).toThrow(
      "invalid JSON",
    );
    expect(() =>
      parseNeutralizedValues('{"unknown":"value"}', productValues),
    ).toThrow("no usable product fields");
    expect(() =>
      parseNeutralizedValues(
        JSON.stringify({
          [legacyOriginalPrice]: "$49.99",
          [legacyCurrentPrice]: "$12.99",
        }),
        productValues,
      ),
    ).toThrow("no usable product fields");
  });
});

describe("Need Match response parsing", () => {
  it("accepts fenced JSON, restores local requirements, and ignores nice-to-have mismatches", () => {
    const responseWithUntrustedRequirements = {
      ...needMatchResponse,
      mustHave: [{ ...needMatchResponse.mustHave[0], requirement: "changed" }],
    };

    expect(
      parseNeedMatchResult(
        `\`\`\`json\n${JSON.stringify(responseWithUntrustedRequirements)}\n\`\`\``,
        productValues,
        userNeed,
      ),
    ).toMatchObject({
      status: "matched",
      mustHave: [{ requirement: "USB-C", status: "matched" }],
      niceToHave: [{ requirement: "Quiet fan", status: "mismatched" }],
    });
  });

  it("computes mismatched and unknown overall states from hard criteria", () => {
    expect(
      parseNeedMatchResult(
        JSON.stringify({
          ...needMatchResponse,
          budget: { status: "mismatched", explanation: "Too expensive." },
        }),
        productValues,
        userNeed,
      ).status,
    ).toBe("mismatched");

    expect(
      parseNeedMatchResult(
        JSON.stringify({
          ...needMatchResponse,
          mustHave: [{ status: "unknown", explanation: "Not specified." }],
        }),
        productValues,
        userNeed,
      ).status,
    ).toBe("unknown");

    expect(
      parseNeedMatchResult(
        JSON.stringify({
          explanation: "No required criteria were saved.",
          budget: null,
          mustHave: [],
          niceToHave: [],
          exclude: [],
        }),
        productValues,
        {
          minBudget: null,
          maxBudget: null,
          mustHave: [],
          niceToHave: [],
          exclude: [],
        },
      ).status,
    ).toBe("unknown");
  });

  it("rejects malformed structures and invalid statuses", () => {
    expect(() => parseNeedMatchResult("not json", productValues, userNeed)).toThrow(
      "invalid JSON",
    );
    expect(() =>
      parseNeedMatchResult(
        JSON.stringify({ ...needMatchResponse, explanation: "" }),
        productValues,
        userNeed,
      ),
    ).toThrow("malformed need match response");
    expect(() =>
      parseNeedMatchResult(
        JSON.stringify({
          ...needMatchResponse,
          mustHave: [{ status: "maybe", explanation: "Unclear." }],
        }),
        productValues,
        userNeed,
      ),
    ).toThrow("malformed need match response");
    expect(() =>
      parseNeedMatchResult(
        JSON.stringify({ ...needMatchResponse, exclude: [] }),
        productValues,
        userNeed,
      ),
    ).toThrow("malformed need match response");
  });
});
