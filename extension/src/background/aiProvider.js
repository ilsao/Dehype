/* global fetch */

import { validateAiSettings } from "../shared/aiSettings.js";

const PRODUCT_FIELDS = new Set([
  "name",
  "originalPrice",
  "currentPrice",
  "discount",
  "image",
  "description",
  "stockAmount",
]);

const SYSTEM_PROMPT = [
  "You are Dehype, a shopping assistant that removes persuasive wording.",
  "Neutralize urgency, scarcity, social pressure, and promotional language.",
  "Preserve factual product details, prices, URLs, and stock quantities.",
  "For stock, state only the listed quantity or availability without urgency.",
  "Return every provided field exactly once in one JSON object with string values.",
].join(" ");

export async function neutralizeProductValues({
  settings: rawSettings,
  productValues,
  fetchImpl = fetch,
}) {
  const settings = validateAiSettings(rawSettings);
  const values = validateProductValues(productValues);
  const prompt = `${SYSTEM_PROMPT}\n\n${JSON.stringify(values, null, 2)}`;

  let responseText;

  if (settings.provider === "openai") {
    responseText = await callOpenAi(settings, prompt, fetchImpl);
  } else if (settings.provider === "gemini") {
    responseText = await callGemini(settings, prompt, fetchImpl);
  } else {
    responseText = await callClaude(settings, prompt, fetchImpl);
  }

  return parseNeutralizedValues(responseText, values);
}

export function parseNeutralizedValues(responseText, originalValues) {
  if (typeof responseText !== "string" || !responseText.trim()) {
    throw new Error("The AI provider returned an empty response.");
  }

  const trimmed = responseText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  let parsed;

  try {
    parsed = JSON.parse(fencedMatch?.[1] ?? trimmed);
  } catch {
    throw new Error("The AI provider returned invalid JSON.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The AI provider response must be a JSON object.");
  }

  const neutralizedValues = {};

  for (const [field, value] of Object.entries(parsed)) {
    if (
      PRODUCT_FIELDS.has(field) &&
      field in originalValues &&
      typeof value === "string"
    ) {
      neutralizedValues[field] = value;
    }
  }

  if (Object.keys(neutralizedValues).length === 0) {
    throw new Error("The AI provider returned no usable product fields.");
  }

  return neutralizedValues;
}

function validateProductValues(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("No product information was provided for analysis.");
  }

  const productValues = {};

  for (const [field, fieldValue] of Object.entries(value)) {
    if (PRODUCT_FIELDS.has(field) && typeof fieldValue === "string") {
      productValues[field] = fieldValue;
    }
  }

  if (!productValues.name) {
    throw new Error("Product information must include a product name.");
  }

  return productValues;
}

async function callOpenAi(settings, prompt, fetchImpl) {
  const response = await fetchImpl("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${settings.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: settings.model,
      input: prompt,
    }),
  });
  const data = await readProviderResponse(response);

  return (
    data.output_text ??
    data.output
      ?.flatMap((item) => item.content ?? [])
      .map((content) => content.text)
      .filter(Boolean)
      .join("\n") ??
    ""
  );
}

async function callGemini(settings, prompt, fetchImpl) {
  const modelPath = settings.model.startsWith("models/")
    ? settings.model
    : `models/${settings.model}`;
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/${encodeURI(modelPath)}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": settings.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );
  const data = await readProviderResponse(response);

  return (
    data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

async function callClaude(settings, prompt, fetchImpl) {
  const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await readProviderResponse(response);

  return (
    data.content
      ?.map((content) => content.text)
      .filter(Boolean)
      .join("\n") ?? ""
  );
}

async function readProviderResponse(response) {
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.error?.message ?? data?.message ?? response.statusText ?? "Unknown error";
    throw new Error(`Provider request failed: ${addProviderHint(message)}`);
  }

  return data ?? {};
}

function addProviderHint(message) {
  if (/not found|not supported for generateContent/i.test(message)) {
    return `${message} Choose a model available to this API key.`;
  }

  if (/rate limit|high demand|overloaded|try again later/i.test(message)) {
    return `${message} Wait briefly or choose another available model.`;
  }

  return message;
}
