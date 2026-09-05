import { describe, expect, it, vi } from "vitest";

import {
  neutralizeProductValues,
  parseNeutralizedValues,
} from "./aiProvider.js";

const productValues = {
  name: "HOT SALE Wireless Earbuds!",
  currentPrice: "$12.99 today only",
  stockAmount: "Only 3 left",
};

function providerResponse(data, ok = true) {
  return {
    ok,
    statusText: ok ? "OK" : "Bad Request",
    json: vi.fn(async () => data),
  };
}

describe("AI provider requests", () => {
  it("uses the selected OpenAI model and key", async () => {
    const fetchImpl = vi.fn(async () =>
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

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(request.headers.authorization).toBe("Bearer key-o");
    const requestBody = JSON.parse(request.body);
    expect(requestBody.model).toBe("gpt-test");
    expect(requestBody.input).not.toContain('"id"');
  });

  it("uses the selected Gemini model and key", async () => {
    const fetchImpl = vi.fn(async () =>
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

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toContain("models/gemini-test:generateContent");
    expect(request.headers["x-goog-api-key"]).toBe("key-g");
    expect(JSON.parse(request.body).generationConfig).toEqual({
      responseMimeType: "application/json",
    });
  });

  it("uses the selected Claude model and key", async () => {
    const fetchImpl = vi.fn(async () =>
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

    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers["x-api-key"]).toBe("key-c");
    expect(request.headers["anthropic-dangerous-direct-browser-access"]).toBe(
      "true",
    );
    expect(JSON.parse(request.body).model).toBe("claude-test");
  });

  it("surfaces provider errors", async () => {
    const fetchImpl = vi.fn(async () =>
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
