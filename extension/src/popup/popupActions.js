import {
  isContentScriptErrorResponse,
  isRebuildCurrentProductResponse,
} from "../shared/productInfo.ts";

const CONTENT_SCRIPT_BUNDLE = "assets/content.js";

export async function sendMessageToActiveTab(
  tabsApi,
  message,
  scriptingApi = globalThis.chrome?.scripting,
) {
  const [activeTab] = await tabsApi.query({ active: true, currentWindow: true });

  if (typeof activeTab?.id !== "number") {
    throw new Error("Open a product page and try again.");
  }

  let response;
  try {
    response = await tabsApi.sendMessage(activeTab.id, message);
  } catch (error) {
    if (!isMissingReceiverError(error) || !scriptingApi?.executeScript) {
      throw readableConnectionError(error);
    }

    try {
      await scriptingApi.executeScript({
        target: { tabId: activeTab.id },
        files: [CONTENT_SCRIPT_BUNDLE],
      });
      response = await tabsApi.sendMessage(activeTab.id, message);
    } catch (injectionError) {
      throw new Error(
        "Dehype could not connect to this tab. Reload the Temu page and try again. " +
          errorMessage(injectionError),
        { cause: injectionError },
      );
    }
  }

  if (message?.type === "DEHYPE_REBUILD_CURRENT_PRODUCT") {
    if (isContentScriptErrorResponse(response)) {
      throw new Error(response.message);
    }
    if (!isRebuildCurrentProductResponse(response)) {
      throw new Error("The page returned an invalid analysis response.");
    }
    return response;
  }

  if (
    message?.type === "DEHYPE_RESTORE_CURRENT_PRODUCT" &&
    response?.type === "DEHYPE_RESTORE_CURRENT_PRODUCT_RESULT"
  ) {
    return response;
  }

  if (isContentScriptErrorResponse(response)) throw new Error(response.message);
  throw new Error("The page did not return a valid response.");
}

function isMissingReceiverError(error) {
  return /could not establish connection|receiving end does not exist/i.test(
    errorMessage(error),
  );
}

function readableConnectionError(error) {
  const message = errorMessage(error);
  return new Error(
    message ||
      "Dehype could not connect to this tab. Reload the Temu page and try again.",
    { cause: error },
  );
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function productInfoValues(productInfo) {
  if (!productInfo || typeof productInfo !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(productInfo)
      .filter(([, element]) => typeof element?.value === "string")
      .map(([field, element]) => [field, element.value]),
  );
}
