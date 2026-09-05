import {
  PRODUCT_INFO_FIELDS,
  type NeutralizedProductValues,
  type ProductInfoField,
  type ProductInfoValueOnly,
} from "../shared/productInfo.js";
import {
  validateRemoteAiSettings,
  type AiSettingsRemote,
} from "../shared/aiSettings.js";
import {
  NEED_MATCH_STATUSES,
  type NeedMatchAssessment,
  type NeedMatchItem,
  type NeedMatchResult,
  type NeedMatchStatus,
} from "../shared/needMatch.js";
import {
  validateUserNeed,
} from "../shared/userNeed.js";

const PRODUCT_FIELDS: ReadonlySet<string> = new Set(PRODUCT_INFO_FIELDS);

const SYSTEM_PROMPT = [
  "You are Dehype, a shopping assistant that removes persuasive wording.",
  "Neutralize urgency, scarcity, social pressure, and promotional language.",
  "Preserve factual product details, prices, URLs, and stock quantities.",
  "For stock, state only the listed quantity or availability without urgency.",
  "Return every provided field exactly once in one JSON object with string values.",
].join(" ");

const NEED_MATCH_SYSTEM_PROMPT = [
  "You are Dehype, a neutral shopping requirements evaluator.",
  "Compare the supplied productInfo facts with userNeed without promotional language or unsupported assumptions.",
  "Use matched only when the product facts provide enough evidence, mismatched for a clear conflict, and unknown when evidence is missing or ambiguous.",
  "For exclude items, matched means the product does not contain the excluded feature; mismatched means it does or may contain it.",
  "Return only one JSON object matching the requested structure.",
].join(" ");

type JsonObject = Record<string, unknown>;

interface ProviderTextPart {
  text?: string;
}

interface ProviderData {
  output_text?: string;
  output?: Array<{ content?: ProviderTextPart[] }>;
  candidates?: Array<{ content?: { parts?: ProviderTextPart[] } }>;
  content?: ProviderTextPart[];
  error?: { message?: string };
  message?: string;
}

interface ProviderResponse {
  ok: boolean;
  statusText?: string;
  json(): Promise<unknown>;
}

export type ProviderFetch = (
  input: string,
  init: RequestInit,
) => Promise<ProviderResponse>;

interface NeutralizeProductValuesOptions {
  settings: unknown;
  productValues: unknown;
  fetchImpl?: ProviderFetch;
}

interface AnalyzeNeedMatchOptions extends NeutralizeProductValuesOptions {
  userNeed: unknown;
}

export async function neutralizeProductValues({
  settings: rawSettings,
  productValues,
  fetchImpl = fetch,
}: NeutralizeProductValuesOptions): Promise<NeutralizedProductValues> {
  const settings = validateRemoteAiSettings(rawSettings);
  const values = validateProductValues(productValues);
  const responseText = await requestProviderText(
    settings,
    SYSTEM_PROMPT,
    JSON.stringify(values, null, 2),
    fetchImpl,
  );

  return parseNeutralizedValues(responseText, values);
}

export async function analyzeNeedMatch({
  settings: rawSettings,
  productValues,
  userNeed: rawUserNeed,
  fetchImpl = fetch,
}: AnalyzeNeedMatchOptions): Promise<NeedMatchResult> {
  const settings = validateRemoteAiSettings(rawSettings);
  const values = validateProductValues(productValues);
  const userNeed = validateUserNeed(rawUserNeed);
  const prompt = [
    "Evaluate this product against the user needs.",
    "Return this exact JSON shape:",
    '{"explanation":"neutral overall explanation","budget":{"status":"matched|mismatched|unknown","explanation":"..."}|null,"mustHave":[{"status":"matched|mismatched|unknown","explanation":"..."}],"niceToHave":[{"status":"matched|mismatched|unknown","explanation":"..."}],"exclude":[{"status":"matched|mismatched|unknown","explanation":"..."}]}',
    "Each array must have exactly one item for each input requirement, in the same order.",
    "Budget must be null only when both budget values are null.",
    JSON.stringify({ productInfo: values, userNeed }, null, 2),
  ].join("\n\n");
  const responseText = await requestProviderText(
    settings,
    NEED_MATCH_SYSTEM_PROMPT,
    prompt,
    fetchImpl,
  );

  return parseNeedMatchResult(responseText, values, userNeed);
}

export function parseNeutralizedValues(
  responseText: unknown,
  originalValues: ProductInfoValueOnly,
): NeutralizedProductValues {
  if (typeof responseText !== "string" || !responseText.trim()) {
    throw new Error("The AI provider returned an empty response.");
  }

  const trimmed = responseText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  let parsed: unknown;

  try {
    parsed = JSON.parse(fencedMatch?.[1] ?? trimmed);
  } catch {
    throw new Error("The AI provider returned invalid JSON.");
  }

  if (!isJsonObject(parsed)) {
    throw new Error("The AI provider response must be a JSON object.");
  }

  const neutralizedValues: NeutralizedProductValues = {};

  for (const [field, value] of Object.entries(parsed)) {
    if (
      PRODUCT_FIELDS.has(field) &&
      field in originalValues &&
      typeof value === "string"
    ) {
      neutralizedValues[field as ProductInfoField] = value;
    }
  }

  if (Object.keys(neutralizedValues).length === 0) {
    throw new Error("The AI provider returned no usable product fields.");
  }

  return neutralizedValues;
}

export function parseNeedMatchResult(
  responseText: unknown,
  originalValues: ProductInfoValueOnly,
  rawUserNeed: unknown,
): NeedMatchResult {
  const userNeed = validateUserNeed(rawUserNeed);
  const parsed = parseJsonObject(responseText);

  if (!isNonEmptyString(parsed.explanation)) {
    throw new Error("The AI provider returned a malformed need match response.");
  }

  const hasBudget = userNeed.minBudget !== null || userNeed.maxBudget !== null;
  const budget = hasBudget
    ? parseAssessment(parsed.budget)
    : parsed.budget === null
      ? null
      : malformedNeedMatch();
  const mustHave = parseItems(parsed.mustHave, userNeed.mustHave);
  const niceToHave = parseItems(parsed.niceToHave, userNeed.niceToHave);
  const exclude = parseItems(parsed.exclude, userNeed.exclude);
  const hardAssessments = [
    ...(budget ? [budget] : []),
    ...mustHave,
    ...exclude,
  ];

  return {
    productName: originalValues.name ?? "Unknown product",
    status: calculateOverallStatus(hardAssessments),
    explanation: parsed.explanation.trim(),
    budget,
    mustHave,
    niceToHave,
    exclude,
  };
}

function validateProductValues(value: unknown): ProductInfoValueOnly {
  if (!isJsonObject(value)) {
    throw new Error("No product information was provided for analysis.");
  }

  const productValues: ProductInfoValueOnly = {};

  for (const [field, fieldValue] of Object.entries(value)) {
    if (PRODUCT_FIELDS.has(field) && typeof fieldValue === "string") {
      productValues[field as ProductInfoField] = fieldValue;
    }
  }

  if (!productValues.name) {
    throw new Error("Product information must include a product name.");
  }

  return productValues;
}

async function requestProviderText(
  settings: AiSettingsRemote,
  systemPrompt: string,
  prompt: string,
  fetchImpl: ProviderFetch,
): Promise<string> {
  if (settings.provider === "openai") {
    return callOpenAi(settings, `${systemPrompt}\n\n${prompt}`, fetchImpl);
  }

  if (settings.provider === "gemini") {
    return callGemini(settings, `${systemPrompt}\n\n${prompt}`, fetchImpl);
  }

  return callClaude(settings, systemPrompt, prompt, fetchImpl);
}

async function callOpenAi(
  settings: AiSettingsRemote,
  prompt: string,
  fetchImpl: ProviderFetch,
): Promise<string> {
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

async function callGemini(
  settings: AiSettingsRemote,
  prompt: string,
  fetchImpl: ProviderFetch,
): Promise<string> {
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

async function callClaude(
  settings: AiSettingsRemote,
  systemPrompt: string,
  prompt: string,
  fetchImpl: ProviderFetch,
): Promise<string> {
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
      system: systemPrompt,
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

function parseJsonObject(responseText: unknown): JsonObject {
  if (typeof responseText !== "string" || !responseText.trim()) {
    throw new Error("The AI provider returned an empty response.");
  }

  const trimmed = responseText.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  let parsed: unknown;

  try {
    parsed = JSON.parse(fencedMatch?.[1] ?? trimmed);
  } catch {
    throw new Error("The AI provider returned invalid JSON.");
  }

  if (!isJsonObject(parsed)) {
    throw new Error("The AI provider response must be a JSON object.");
  }

  return parsed;
}

function parseAssessment(value: unknown): NeedMatchAssessment {
  if (
    !isJsonObject(value) ||
    !isNeedMatchStatus(value.status) ||
    !isNonEmptyString(value.explanation)
  ) {
    return malformedNeedMatch();
  }

  return { status: value.status, explanation: value.explanation.trim() };
}

function parseItems(value: unknown, requirements: string[]): NeedMatchItem[] {
  if (!Array.isArray(value) || value.length !== requirements.length) {
    return malformedNeedMatch();
  }

  return value.map((item, index) => ({
    requirement: requirements[index]!,
    ...parseAssessment(item),
  }));
}

function calculateOverallStatus(
  assessments: NeedMatchAssessment[],
): NeedMatchStatus {
  if (assessments.some(({ status }) => status === "mismatched")) {
    return "mismatched";
  }

  if (
    assessments.length === 0 ||
    assessments.some(({ status }) => status === "unknown")
  ) {
    return "unknown";
  }

  return "matched";
}

function malformedNeedMatch(): never {
  throw new Error("The AI provider returned a malformed need match response.");
}

function isNeedMatchStatus(value: unknown): value is NeedMatchStatus {
  return NEED_MATCH_STATUSES.some((status) => status === value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

async function readProviderResponse(
  response: ProviderResponse,
): Promise<ProviderData> {
  const data = (await response.json().catch(() => null)) as ProviderData | null;

  if (!response.ok) {
    const message =
      data?.error?.message ??
      data?.message ??
      response.statusText ??
      "Unknown error";
    throw new Error(`Provider request failed: ${addProviderHint(message)}`);
  }

  return data ?? {};
}

function addProviderHint(message: string): string {
  if (/not found|not supported for generateContent/i.test(message)) {
    return `${message} Choose a model available to this API key.`;
  }

  if (/rate limit|high demand|overloaded|try again later/i.test(message)) {
    return `${message} Wait briefly or choose another available model.`;
  }

  return message;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}