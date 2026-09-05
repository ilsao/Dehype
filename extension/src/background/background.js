import { neutralizeProductValues } from "./aiProvider.js";
import { loadAiSettings } from "../shared/aiSettings.js";

console.log("[Dehype] Background service worker started.");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "getStatus") {
    void loadAiSettings(chrome.storage.local)
      .then((settings) => sendResponse({ healthy: true, configured: !!settings }))
      .catch(() => sendResponse({ healthy: true, configured: false }));
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

function neutralizeValuesLocally(productValues) {
  return {
    name: neutralizeMarketingText(productValues.name),
    originPrize: neutralizeMarketingText(productValues.originPrize),
    realPrize: neutralizeMarketingText(productValues.realPrize),
    discount: neutralizeDiscountText(productValues.discount),
    image: productValues.image,
    description: neutralizeMarketingText(productValues.description),
    stockAmount: neutralizeScarcityText(productValues.stockAmount),
    originalPrice: neutralizeMarketingText(productValues.originalPrice),
    currentPrice: neutralizeMarketingText(productValues.currentPrice),
  };
}

function neutralizeMarketingText(value) {
  if (!value) {
    return value;
  }

  return value
    .replace(/\b(today only|limited time|flash sale|hot sale)\b/gi, "")
    .replace(/\b(must[- ]?have|viral|trending|best seller)\b/gi, "")
    .replace(/!+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function neutralizeDiscountText(value) {
  if (!value) {
    return value;
  }

  const discountMatch = value.match(/\d+\s?%\s*off/i);

  if (discountMatch) {
    return `${discountMatch[0].replace(/\s+/g, " ")} discount listed`;
  }

  return neutralizeMarketingText(value);
}

function neutralizeScarcityText(value) {
  if (!value) {
    return value;
  }

  const quantityMatch = value.match(/\d+/);

  if (quantityMatch) {
    return `Listed stock quantity: ${quantityMatch[0]}`;
  }

  return "Stock information listed";
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
