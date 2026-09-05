import { TemuProductAdapter } from "../adapters/temuProductAdapter";
import { DEHYPE_ELEMENT_ID } from "../adapters/productAdapter";
import type {
  NeutralizeProductInfoErrorResponse,
  NeutralizeProductValuesResponse,
  NeutralizedProductValues,
  ProductInfo,
  ProductInfoValueOnly,
} from "../shared/productInfo";
import {
  PRODUCT_INFO_FIELDS,
  mergeNeutralizedValuesIntoProductInfo,
  toValueOnlyProductInfo,
} from "../shared/productInfo";

const productAdapter = new TemuProductAdapter();

type SendResponse = (response?: unknown) => void;

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
    _sender: chrome.runtime.MessageSender,
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
  const productInfo = extractCurrentProduct(document, window.location.href);

  if (!productInfo) {
    return {
      ok: false,
      error: "Open a supported Temu product detail page and try again.",
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

export function extractCurrentProduct(
  sourceDocument: Document,
  pageUrl: string = window.location.href,
): ProductInfo | undefined {
  if (!productAdapter.isSupportedPage(pageUrl)) {
    return undefined;
  }

  return productAdapter.extractProductInfo(sourceDocument, pageUrl);
}

async function requestNeutralizedValues(
  valueOnlyPayloadForAi: ProductInfoValueOnly,
): Promise<NeutralizedProductValues> {
  const response = (await chrome.runtime.sendMessage({
    type: "DEHYPE_NEUTRALIZE_VALUES",
    productValues: valueOnlyPayloadForAi,
  })) as NeutralizeResponse;

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
