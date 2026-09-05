interface TabsApi {
  query(
    queryInfo: chrome.tabs.QueryInfo,
  ): Promise<Array<{ id?: number | undefined }>>;
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
}

export async function sendMessageToActiveTab<Response>(
  tabsApi: TabsApi,
  message: unknown,
): Promise<Response> {
  const [activeTab] = await tabsApi.query({ active: true, currentWindow: true });

  if (typeof activeTab?.id !== "number") {
    throw new Error("Open a product page and try again.");
  }

  const response = await tabsApi.sendMessage(activeTab.id, message);

  if (!response) {
    throw new Error("The page did not respond. Reload the page and try again.");
  }

  return response as Response;
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
