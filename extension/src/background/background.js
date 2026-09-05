import { neutralizeProductValues } from "./aiProvider.js";
import { neutralizeValuesLocally } from "./localNeutralizer.js";
import {
  getAiSettingsStatus,
  loadAiSettings,
} from "../shared/aiSettings.js";

console.log("[Dehype] Background service worker started.");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getStatus") {
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

  if (message?.type === "DEHYPE_NEUTRALIZE_VALUES_LOCALLY") {
    sendResponse({
      type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
      productValues: neutralizeValuesLocally(message.productValues ?? {}),
    });
    return false;
  }

  return false;
});

async function neutralizeWithSavedSettings(productValues) {
  const settings = await loadAiSettings(chrome.storage.local);

  if (!settings) {
    throw new Error("Open Dehype and save your AI provider, model, and API key.");
  }

  return neutralizeProductValues({ settings, productValues });
}

function isNeutralizeProductValuesRequest(message) {
  return (
    typeof message === "object" &&
    message !== null &&
    message.type === "DEHYPE_NEUTRALIZE_VALUES" &&
    typeof message.productValues === "object" &&
    message.productValues !== null
  );
}
