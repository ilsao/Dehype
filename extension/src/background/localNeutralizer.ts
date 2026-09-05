import type { ProductInfoValueOnly } from "../shared/productInfo.js";

export function neutralizeValuesLocally(productValues: ProductInfoValueOnly) {
  return {
    name: neutralizeMarketingText(productValues.name),
    originalPrice: neutralizeMarketingText(productValues.originalPrice),
    currentPrice: neutralizeMarketingText(productValues.currentPrice),
    discount: neutralizeDiscountText(productValues.discount),
    image: productValues.image,
    description: neutralizeMarketingText(productValues.description),
    stockAmount: neutralizeScarcityText(productValues.stockAmount),
  };
}

function neutralizeMarketingText(value: string | undefined) {
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

function neutralizeDiscountText(value: string | undefined) {
  if (!value) {
    return value;
  }

  const discountMatch = value.match(/\d+\s?%\s*off/i);

  if (discountMatch) {
    return `${discountMatch[0].replace(/\s+/g, " ")} discount listed`;
  }

  return neutralizeMarketingText(value);
}

function neutralizeScarcityText(value: string | undefined) {
  if (!value) {
    return value;
  }

  const quantityMatch = value.match(/\d+/);

  if (quantityMatch) {
    return `Listed stock quantity: ${quantityMatch[0]}`;
  }

  return "Stock information listed";
}
