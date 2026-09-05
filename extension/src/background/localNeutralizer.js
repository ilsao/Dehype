export function neutralizeValuesLocally(productValues) {
  const result = {};
  copy(result, "name", neutralizeMarketingText(productValues.name));
  copy(result, "originalPrice", neutralizeMarketingText(productValues.originalPrice));
  copy(result, "currentPrice", neutralizeMarketingText(productValues.currentPrice));
  copy(result, "discount", neutralizeDiscountText(productValues.discount));
  copy(result, "image", productValues.image);
  copy(result, "description", neutralizeMarketingText(productValues.description));
  copy(result, "stockAmount", neutralizeScarcityText(productValues.stockAmount));
  return result;
}

function copy(target, field, value) {
  if (typeof value === "string") target[field] = value;
}

function neutralizeMarketingText(value) {
  if (!value) {
    return value;
  }

  return value
    .replace(/\b(today only|limited time|flash sale|hot sale)\b/gi, "")
    .replace(/\b(must[- ]?have|viral|trending|best seller)\b/gi, "")
    .replace(
      /(?:今日限定|今日特價|限時(?:優惠|特價|搶購)?|熱門|熱賣|爆款|必買|今日限时|今日特价|限时(?:优惠|特价|抢购)?|热门|热卖|必买)/g,
      "",
    )
    .replace(/!+/g, "")
    .replace(/[！]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function neutralizeDiscountText(value) {
  if (!value) {
    return value;
  }

  const discountMatch = value.match(/\d+(?:[.,]\d+)?\s?%\s*off/i);

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
