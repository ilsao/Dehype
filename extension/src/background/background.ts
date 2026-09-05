import { neutralizeProductValues, type ProviderFetch } from "./aiProvider.js";
import { getAiSettingsStatus, loadAiSettings } from "../shared/aiSettings.js";
import {
  isNeutralizeProductValuesRequest,
  type NeutralizeProductValuesResponse,
  type NeutralizeSource,
  type ProductInfoField,
  type ProductInfoValueOnly,
} from "../shared/productInfo.js";

interface NeutralizeWorkflowDependencies {
  storage?: chrome.storage.StorageArea;
  fetchImpl?: ProviderFetch;
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

export async function neutralizeWithSavedSettings(
  productValues: ProductInfoValueOnly,
  dependencies: NeutralizeWorkflowDependencies = {},
): Promise<NeutralizeWorkflowResult> {
  const storage = dependencies.storage ?? chrome.storage.local;
  const settings = await loadAiSettings(storage);

  if (settings.state !== "remote") {
    return structuralResult(
      productValues,
      "Configure and consent to an AI provider to analyze product wording.",
    );
  }

  try {
    const neutralizeOptions = {
      settings,
      productValues,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    };
    const modelValues = await neutralizeProductValues(neutralizeOptions);
    const modelOverlay: ProductInfoValueOnly = {
      ...productValues,
      ...modelValues,
    };

    for (const field of ["originalPrice", "currentPrice", "image"] as const) {
      preserveLocalFact(modelOverlay, productValues, field);
    }

    return {
      productValues: modelOverlay,
      source: "model",
    };
  } catch (error) {
    return structuralResult(
      productValues,
      error instanceof Error
        ? error.message
        : "The model response could not be used.",
    );
  }
}

function structuralResult(
  productValues: ProductInfoValueOnly,
  fallbackReason: string,
): NeutralizeWorkflowResult {
  return {
    productValues: { ...productValues },
    source: "structural",
    fallbackReason,
  };
}

function preserveLocalFact(
  modelOverlay: ProductInfoValueOnly,
  productValues: ProductInfoValueOnly,
  field: ProductInfoField,
): void {
  const value = productValues[field];
  if (typeof value === "string") {
    modelOverlay[field] = value;
  } else {
    delete modelOverlay[field];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
