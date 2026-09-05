import { runNeutralizeWorkflow } from "./neutralizeWorkflow.js";
import { runNeedMatchWorkflow } from "./needMatchWorkflow.js";
import type { ProviderFetch } from "./aiProvider.js";
import { getAiSettingsStatus } from "../shared/aiSettings.js";
import {
  isAnalyzeNeedMatchValuesRequest,
  isNeutralizeProductValuesRequest,
  type AnalyzeNeedMatchValuesResponse,
  type NeutralizeProductValuesResponse,
  type NeutralizeSource,
  type ProductInfoValueOnly,
} from "../shared/productInfo.js";

interface NeutralizeWorkflowDependencies {
  storage?: chrome.storage.StorageArea;
  fetchImpl?: ProviderFetch;
  createAnalysisId?: () => string;
}

interface NeutralizeWorkflowResult {
  productValues: ProductInfoValueOnly;
  source: NeutralizeSource;
  fallbackReason?: string;
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isRecord(message) && message.type === "getStatus") {
      void getAiSettingsStatus(chrome.storage.local).then(sendResponse);
      return true;
    }

    if (isAnalyzeNeedMatchValuesRequest(message)) {
      void analyzeNeedMatchWithSavedSettings(message.productValues)
        .then((response) => sendResponse(response))
        .catch((error: unknown) =>
          sendResponse({
            type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES_RESULT",
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      return true;
    }

    if (
      isRecord(message) &&
      message.type === "DEHYPE_GENERATE_SEARCH_KEYWORD" &&
      typeof message.productName === "string"
    ) {
      sendResponse({
        type: "DEHYPE_GENERATE_SEARCH_KEYWORD_RESULT",
        searchKeyword: localSearchKeyword(message.productName),
      });
      return false;
    }

    if (!isNeutralizeProductValuesRequest(message)) return false;

    void neutralizeWithSavedSettings(message.productValues)
      .then(({ productValues, source, fallbackReason }) => {
        const response: NeutralizeProductValuesResponse = {
          type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
          productValues,
          source,
          ...(fallbackReason ? { fallbackReason } : {}),
        };
        sendResponse(response);
      })
      .catch((error: unknown) =>
        sendResponse({
          type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  });
}

function localSearchKeyword(productName: string): string {
  const keyword = productName
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
  if (!keyword) throw new Error("Product information must include a product name.");
  return keyword;
}

export async function generateKeywordWithSavedSettings(productName: string): Promise<string> {
  return localSearchKeyword(productName);
}

export async function neutralizeWithSavedSettings(
  productValues: ProductInfoValueOnly,
  dependencies: NeutralizeWorkflowDependencies = {},
): Promise<NeutralizeWorkflowResult> {
  const storage = dependencies.storage ?? chrome.storage.local;
  try {
    const neutralizedValues = await runNeutralizeWorkflow({
      productValues,
      storage,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    });

    return {
      productValues: overlayModelValues(productValues, neutralizedValues),
      source: "model",
    };
  } catch (error) {
    return {
      productValues: { ...productValues },
      source: "structural",
      fallbackReason:
        error instanceof Error
          ? error.message
          : "The model response could not be used.",
    };
  }
}

export async function analyzeNeedMatchWithSavedSettings(
  productValues: ProductInfoValueOnly,
  dependencies: NeutralizeWorkflowDependencies = {},
): Promise<AnalyzeNeedMatchValuesResponse> {
  const storage = dependencies.storage ?? chrome.storage.local;
  const analysis = await runNeedMatchWorkflow({
    productValues,
    storage,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.createAnalysisId
      ? { createAnalysisId: dependencies.createAnalysisId }
      : {}),
  });

  return {
    type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES_RESULT",
    ok: analysis.state === "success",
    ...(analysis.state === "error" ? { message: analysis.message } : {}),
  };
}

function overlayModelValues(
  productValues: ProductInfoValueOnly,
  modelValues: ProductInfoValueOnly,
): ProductInfoValueOnly {
  const modelOverlay: ProductInfoValueOnly = {
    ...productValues,
    ...modelValues,
  };

  for (const field of ["originalPrice", "currentPrice", "image"] as const) {
    const value = productValues[field];
    if (typeof value === "string") {
      modelOverlay[field] = value;
    } else {
      delete modelOverlay[field];
    }
  }

  return modelOverlay;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
