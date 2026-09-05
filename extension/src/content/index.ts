import type {
  NeutralizeProductInfoErrorResponse,
  NeutralizeProductValuesResponse,
  NeutralizedProductValues,
  ProductElement,
  ProductInfo,
  ProductInfoValueOnly,
} from "../shared/productInfo";
import {
  PRODUCT_INFO_FIELDS,
  mergeNeutralizedValuesIntoProductInfo,
  toValueOnlyProductInfo,
} from "../shared/productInfo";

const DEHYPE_ELEMENT_ID = "data-dehype-element-id";

type SendResponse = (response?: unknown) => void;

declare const chrome: {
  runtime: {
    onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          sendResponse: SendResponse,
        ) => boolean | void,
      ): void;
    };
    sendMessage<T>(message: unknown): Promise<T>;
  };
};

interface RebuildCurrentProductMessage {
  type: "DEHYPE_REBUILD_CURRENT_PRODUCT";
}

interface RestoreCurrentProductMessage {
  type: "DEHYPE_RESTORE_CURRENT_PRODUCT";
}

type ContentScriptMessage =
  | RebuildCurrentProductMessage
  | RestoreCurrentProductMessage;

type NeutralizeResponse =
  | NeutralizeProductValuesResponse
  | NeutralizeProductInfoErrorResponse;

const originalTextByElementId = new Map<string, string>();

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: unknown,
    sendResponse: SendResponse,
  ) => {
    if (!isContentScriptMessage(message)) {
      return false;
    }

    if (message.type === "DEHYPE_REBUILD_CURRENT_PRODUCT") {
      void rebuildCurrentProduct()
        .then(sendResponse)
        .catch((error) =>
          sendResponse({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      return true;
    }

    if (message.type === "DEHYPE_RESTORE_CURRENT_PRODUCT") {
      restoreOriginalText();
      sendResponse({ ok: true });
    }

    return false;
  },
);

async function rebuildCurrentProduct(): Promise<{
  ok: boolean;
  productInfo?: ProductInfo;
  error?: string;
}> {
  const productInfo = extractProductInfoFromPage();

  if (!productInfo) {
    return {
      ok: false,
      error: "No product information was found on this page.",
    };
  }

  const valueOnlyPayloadForAi = toValueOnlyProductInfo(productInfo);
  const neutralizedValues = await requestNeutralizedValues(valueOnlyPayloadForAi);
  const neutralizedProductInfo = mergeNeutralizedValuesIntoProductInfo(
    productInfo,
    neutralizedValues,
  );

  applyProductInfoText(neutralizedProductInfo);

  return {
    ok: true,
    productInfo: neutralizedProductInfo,
  };
}

function extractProductInfoFromPage(): ProductInfo | null {
  const nameElement =
    document.querySelector<HTMLElement>("h1") ??
    document.querySelector<HTMLElement>("[data-testid*='title']");

  if (!nameElement?.textContent?.trim()) {
    return null;
  }

  const originPrize = optionalElement(
    findElementByText(/\b(original|list|was)\b/i),
  );
  const realPrize = optionalElement(
    findElementByText(/[$NT¥€£]\s?\d|^\s?\d+(\.\d{2})?\s?$/),
  );
  const discount = optionalElement(
    findElementByText(/\b(\d+%\s*off|discount|sale)\b/i),
  );
  const image = optionalImageElement(
    document.querySelector<HTMLImageElement>("img"),
  );
  const description = optionalElement(
    document.querySelector<HTMLElement>(
      "[data-testid*='description'], [class*='description']",
    ),
  );
  const stockAmount = optionalElement(
    findElementByText(/\b(only\s+\d+\s+left|\d+\s+left|stock)\b/i),
  );

  return {
    name: toProductElement(nameElement),
    ...(originPrize ? { originPrize } : {}),
    ...(realPrize ? { realPrize } : {}),
    ...(discount ? { discount } : {}),
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
    ...(stockAmount ? { stockAmount } : {}),
  };
}

async function requestNeutralizedValues(
  valueOnlyPayloadForAi: ProductInfoValueOnly,
): Promise<NeutralizedProductValues> {
  const response = await chrome.runtime.sendMessage<NeutralizeResponse>({
    type: "DEHYPE_NEUTRALIZE_VALUES",
    productValues: valueOnlyPayloadForAi,
  });

  if (response.type === "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR") {
    throw new Error(response.message);
  }

  return response.productValues;
}

function applyProductInfoText(productInfo: ProductInfo): void {
  for (const field of PRODUCT_INFO_FIELDS) {
    if (field === "image") {
      continue;
    }

    const productElement = productInfo[field];

    if (!productElement) {
      continue;
    }

    const domElement = findDomElementByDehypeId(productElement.id);

    if (!domElement) {
      continue;
    }

    if (!originalTextByElementId.has(productElement.id)) {
      originalTextByElementId.set(
        productElement.id,
        domElement.textContent ?? "",
      );
    }

    domElement.textContent = productElement.value;
  }
}

function restoreOriginalText(): void {
  for (const [id, originalText] of originalTextByElementId.entries()) {
    const domElement = findDomElementByDehypeId(id);

    if (domElement) {
      domElement.textContent = originalText;
    }
  }

  originalTextByElementId.clear();
}

function toProductElement(element: HTMLElement): ProductElement {
  const id = getOrCreateDehypeId(element);

  return {
    id,
    value: element.textContent?.trim() ?? "",
  };
}

function optionalElement(
  element: HTMLElement | null,
): ProductElement | undefined {
  if (!element?.textContent?.trim()) {
    return undefined;
  }

  return toProductElement(element);
}

function optionalImageElement(
  element: HTMLImageElement | null,
): ProductElement | undefined {
  if (!element?.src) {
    return undefined;
  }

  const id = getOrCreateDehypeId(element);

  return {
    id,
    value: element.src,
  };
}

function findElementByText(pattern: RegExp): HTMLElement | null {
  const elements = Array.from(
    document.querySelectorAll<HTMLElement>("body *"),
  );

  return (
    elements.find((element) => {
      const text = element.textContent?.trim();

      return Boolean(text && text.length <= 140 && pattern.test(text));
    }) ?? null
  );
}

function getOrCreateDehypeId(element: HTMLElement): string {
  const existingId = element.getAttribute(DEHYPE_ELEMENT_ID);

  if (existingId) {
    return existingId;
  }

  const id = crypto.randomUUID();
  element.setAttribute(DEHYPE_ELEMENT_ID, id);
  return id;
}

function findDomElementByDehypeId(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[${DEHYPE_ELEMENT_ID}="${CSS.escape(id)}"]`,
  );
}

function isContentScriptMessage(
  message: unknown,
): message is ContentScriptMessage {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    (message.type === "DEHYPE_REBUILD_CURRENT_PRODUCT" ||
      message.type === "DEHYPE_RESTORE_CURRENT_PRODUCT")
  );
}
