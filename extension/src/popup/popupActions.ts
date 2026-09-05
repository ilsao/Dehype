import {
  isContentScriptErrorResponse,
  isRebuildCurrentProductResponse,
} from "../shared/productInfo.js";

const CONTENT_SCRIPT_BUNDLE = "assets/content.js";

interface TabsApi {
  query(
    queryInfo: chrome.tabs.QueryInfo,
  ): Promise<Array<{ id?: number | undefined }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

interface ScriptingApi {
  executeScript(
    injection:
      | {
          target: { tabId: number };
          files: string[];
        }
      | {
          target: { tabId: number };
          func: () => void;
        },
  ): Promise<unknown>;
}

export async function sendMessageToActiveTab<Response>(
  tabsApi: TabsApi,
  scriptingApi: ScriptingApi | undefined,
  message: unknown,
): Promise<Response> {
  const [activeTab] = await tabsApi.query({ active: true, currentWindow: true });

  if (typeof activeTab?.id !== "number") {
    throw new Error("Open a product page and try again.");
  }

  let response: unknown;
  try {
    response = await tabsApi.sendMessage(activeTab.id, message);
  } catch (error) {
    if (!isMissingReceiverError(error) || !scriptingApi?.executeScript) {
      throw readableConnectionError(error);
    }

    try {
      await scriptingApi.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          window.__dehypeSkipInitialNeedMatch = true;
        },
      });
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

  if (isRebuildRequest(message)) {
    if (isContentScriptErrorResponse(response)) {
      throw new Error(response.message);
    }
    if (!isRebuildCurrentProductResponse(response)) {
      throw new Error("The page returned an invalid analysis response.");
    }
    return response as Response;
  }

  if (
    isRestoreRequest(message) &&
    isRecord(response) &&
    response.type === "DEHYPE_RESTORE_CURRENT_PRODUCT_RESULT"
  ) {
    return response as Response;
  }

  if (isContentScriptErrorResponse(response)) throw new Error(response.message);
  throw new Error("The page did not return a valid response.");
}

export function productInfoValues(productInfo: unknown): Record<string, string> {
  if (!isRecord(productInfo)) return {};

  return Object.fromEntries(
    Object.entries(productInfo)
      .filter(
        ([, element]) =>
          isRecord(element) && typeof element.value === "string",
      )
      .map(([field, element]) => [field, (element as { value: string }).value]),
  );
}

function isMissingReceiverError(error: unknown): boolean {
  return /could not establish connection|receiving end does not exist/i.test(
    errorMessage(error),
  );
}

function readableConnectionError(error: unknown): Error {
  const message = errorMessage(error);
  return new Error(
    message ||
      "Dehype could not connect to this tab. Reload the Temu page and try again.",
    { cause: error },
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isRebuildRequest(
  message: unknown,
): message is { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" } {
  return isRecord(message) && message.type === "DEHYPE_REBUILD_CURRENT_PRODUCT";
}

function isRestoreRequest(
  message: unknown,
): message is { type: "DEHYPE_RESTORE_CURRENT_PRODUCT" } {
  return isRecord(message) && message.type === "DEHYPE_RESTORE_CURRENT_PRODUCT";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}