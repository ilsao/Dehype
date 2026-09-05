interface TabsApi {
  query(
    queryInfo: chrome.tabs.QueryInfo,
  ): Promise<Array<{ id?: number | undefined }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

interface ScriptingApi {
  executeScript(injection: {
    target: { tabId: number };
    files: string[];
  }): Promise<unknown>;
}

const CONTENT_SCRIPT_FILE = "assets/content.js";

export async function sendMessageToActiveTab<Response>(
  tabsApi: TabsApi,
  scriptingApi: ScriptingApi,
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
    if (!isMissingReceiverError(error)) {
      throw error;
    }

    await scriptingApi.executeScript({
      target: { tabId: activeTab.id },
      files: [CONTENT_SCRIPT_FILE],
    });
    response = await tabsApi.sendMessage(activeTab.id, message);
  }

  if (!response) {
    throw new Error("The page did not respond. Reload the page and try again.");
  }

  return response as Response;
}

function isMissingReceiverError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /receiving end does not exist|could not establish connection/i.test(
    message,
  );
}

export function productInfoValues(productInfo: unknown): Record<string, string> {
  if (!productInfo || typeof productInfo !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(productInfo)
      .filter(
        ([, element]) =>
          typeof (element as { value?: unknown } | null | undefined)?.value ===
          "string",
      )
      .map(([field, element]) => [
        field,
        (element as { value: string }).value,
      ]),
  );
}
