export async function sendMessageToActiveTab(tabsApi, message) {
  const [activeTab] = await tabsApi.query({ active: true, currentWindow: true });

  if (typeof activeTab?.id !== "number") {
    throw new Error("Open a product page and try again.");
  }

  const response = await tabsApi.sendMessage(activeTab.id, message);

  if (!response) {
    throw new Error("The page did not respond. Reload the page and try again.");
  }

  return response;
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
