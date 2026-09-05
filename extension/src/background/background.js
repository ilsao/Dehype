import { neutralizeProductValues } from "./aiProvider.js";
import { neutralizeValuesLocally } from "./localNeutralizer.js";
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
  const localValues = neutralizeValuesLocally(productValues);

  if (settings.mode !== "remote") {
    return { productValues: localValues, source: "local" };
  }

  try {
    const modelValues = await neutralizeProductValues({
      settings,
      productValues,
      fetchImpl: dependencies.fetchImpl,
    });
    // A model may omit fields or retain subtle urgency. Keep deterministic
    // coverage as the baseline, overlay usable model output, then apply the
    // local rules once more so remote mode cannot weaken core neutralization.
    const modelOverlay = {
      ...localValues,
      ...modelValues,
    };
    // Prices and images are canonical local facts. The model may rewrite only
    // language fields and must never alter these values or introduce them.
    for (const field of ["originalPrice", "currentPrice", "image"]) {
      if (Object.hasOwn(localValues, field)) {
        modelOverlay[field] = localValues[field];
      } else {
        delete modelOverlay[field];
      }
    }
    const productValuesWithDeterministicCoverage =
      neutralizeValuesLocally(modelOverlay);
    return {
      productValues: productValuesWithDeterministicCoverage,
      source: "model",
    };
  } catch (error) {
    return {
      productValues: localValues,
      source: "local",
      fallbackReason:
        error instanceof Error
          ? error.message
          : "The model response could not be used.",
    };
  }
}
