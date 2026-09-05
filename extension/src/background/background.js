import { neutralizeProductValues } from "./aiProvider.js";
import {
  getAiSettingsStatus,
  loadAiSettings,
} from "../shared/aiSettings.js";
import { isNeutralizeProductValuesRequest } from "../shared/productInfo.ts";

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "getStatus") {
      void getAiSettingsStatus(chrome.storage.local).then(sendResponse);
      return true;
    }

    if (!isNeutralizeProductValuesRequest(message)) return false;

    void neutralizeWithSavedSettings(message.productValues)
      .then(({ productValues, source, fallbackReason }) => {
        const response = {
          type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
          productValues,
          source,
        };
        if (fallbackReason) response.fallbackReason = fallbackReason;
        sendResponse(response);
      })
      .catch((error) =>
        sendResponse({
          type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  });
}

export async function neutralizeWithSavedSettings(productValues, dependencies = {}) {
  const storage = dependencies.storage ?? chrome.storage.local;
  const settings = await loadAiSettings(storage);

  if (settings.state !== "remote") {
    return {
      productValues: { ...productValues },
      source: "structural",
      fallbackReason: "Configure and consent to an AI provider to analyze product wording.",
    };
  }

  try {
    const modelValues = await neutralizeProductValues({
      settings,
      productValues,
      fetchImpl: dependencies.fetchImpl,
    });
    // A model may omit fields. Preserve original facts for omitted values and
    // overlay only validated model text.
    const modelOverlay = {
      ...productValues,
      ...modelValues,
    };
    // Prices and images are canonical local facts. The model may rewrite only
    // language fields and must never alter these values or introduce them.
    for (const field of ["originalPrice", "currentPrice", "image"]) {
      if (Object.hasOwn(productValues, field)) {
        modelOverlay[field] = productValues[field];
      } else {
        delete modelOverlay[field];
      }
    }
    return {
      productValues: modelOverlay,
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
