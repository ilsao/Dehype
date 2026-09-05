import { runNeutralizeWorkflow } from "./neutralizeWorkflow.js";
import { neutralizeValuesLocally } from "./localNeutralizer.js";
import {
  getAiSettingsStatus,
} from "../shared/aiSettings.js";
import type {
  NeutralizeProductValuesRequest,
  ProductInfoValueOnly,
} from "../shared/productInfo.js";

console.log("[Dehype] Background service worker started.");

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isMessageType(message, "getStatus")) {
    void getAiSettingsStatus(chrome.storage.local).then(sendResponse);
    return true;
  }

  if (isNeutralizeProductValuesRequest(message)) {
    void neutralizeWithSavedSettings(message.productValues)
      .then((productValues) =>
        sendResponse({
          type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
          productValues,
        }),
      )
      .catch((error) =>
        sendResponse({
          type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  }

  if (isLocalNeutralizeRequest(message)) {
    sendResponse({
      type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
      productValues: neutralizeValuesLocally(message.productValues ?? {}),
    });
    return false;
  }

  return false;
});

async function neutralizeWithSavedSettings(
  productValues: ProductInfoValueOnly,
) {
  return runNeutralizeWorkflow({
    productValues,
    storage: chrome.storage.local,
  });
}

function isNeutralizeProductValuesRequest(
  message: unknown,
): message is NeutralizeProductValuesRequest {
  return (
    isRecord(message) &&
    message.type === "DEHYPE_NEUTRALIZE_VALUES" &&
    typeof message.productValues === "object" &&
    message.productValues !== null
  );
}

function isLocalNeutralizeRequest(
  message: unknown,
): message is { type: "DEHYPE_NEUTRALIZE_VALUES_LOCALLY"; productValues?: ProductInfoValueOnly } {
  return isMessageType(message, "DEHYPE_NEUTRALIZE_VALUES_LOCALLY");
}

function isMessageType(message: unknown, type: string): message is Record<string, unknown> {
  return isRecord(message) && message.type === type;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
