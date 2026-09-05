import type {
  NeutralizeProductValuesRequest,
  NeutralizedProductValues,
  ProductInfoValueOnly,
} from "../shared/productInfo";

type ChromeMessageSender = chrome.runtime.MessageSender;
type SendResponse = (response?: unknown) => void;

chrome.runtime.onMessage.addListener(
  (
    message: unknown,
    _sender: ChromeMessageSender,
    sendResponse: SendResponse,
  ) => {
    if (!isNeutralizeProductValuesRequest(message)) {
      return false;
    }

    void neutralizeValues(message.productValues).then(sendResponse);
    return true;
  },
);

async function neutralizeValues(
  productValues: ProductInfoValueOnly,
): Promise<NeutralizedProductValues> {
  /*
   * This function is intentionally value-only. Keep ProductElement.id out of
   * this boundary when replacing the local fallback with a real AI request.
   */
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

function neutralizeMarketingText(value: string | undefined): string | undefined {
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

function neutralizeDiscountText(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  const discountMatch = value.match(/\d+\s?%\s*off/i);

  if (discountMatch) {
    return `${discountMatch[0].replace(/\s+/g, " ")} discount listed`;
  }

  return neutralizeMarketingText(value);
}

function neutralizeScarcityText(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  const quantityMatch = value.match(/\d+/);

  if (quantityMatch) {
    return `Listed stock quantity: ${quantityMatch[0]}`;
  }

  return "Stock information listed";
}

function isNeutralizeProductValuesRequest(
  message: unknown,
): message is NeutralizeProductValuesRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "DEHYPE_NEUTRALIZE_VALUES" &&
    "productValues" in message &&
    typeof message.productValues === "object" &&
    message.productValues !== null
  );
}
