/**
 * One extracted product field and the DOM node it came from.
 *
 * The id must stay local to the extension. It is used only to map a
 * neutralized value back to the original DOM node.
 */
export interface ProductElement {
  id: string;
  value: string;
}

export type Elem = ProductElement;

export interface ProductInfo {
  name: ProductElement;
  originPrize?: ProductElement;
  realPrize?: ProductElement;
  discount?: ProductElement;
  image?: ProductElement;
  description?: ProductElement;
  stockAmount?: ProductElement;

  /** Compatibility aliases for code that uses price spelling. */
  originalPrice?: ProductElement;
  currentPrice?: ProductElement;
}

export type ProductInfoField = keyof ProductInfo;

export type ProductInfoValueOnly = {
  [Field in ProductInfoField]?: string;
};

export type NeutralizedProductValues = ProductInfoValueOnly;

export const PRODUCT_INFO_FIELDS = [
  "name",
  "originPrize",
  "realPrize",
  "discount",
  "image",
  "description",
  "stockAmount",
  "originalPrice",
  "currentPrice",
] as const satisfies readonly ProductInfoField[];

export interface NeutralizeProductInfoRequest {
  type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO";
  productInfo: ProductInfo;
}

export interface NeutralizeProductValuesRequest {
  type: "DEHYPE_NEUTRALIZE_VALUES";
  productValues: ProductInfoValueOnly;
}

export interface NeutralizeProductInfoResponse {
  type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_RESULT";
  productInfo: ProductInfo;
}

export interface NeutralizeProductValuesResponse {
  type: "DEHYPE_NEUTRALIZE_VALUES_RESULT";
  productValues: NeutralizedProductValues;
}

export interface NeutralizeProductInfoErrorResponse {
  type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR";
  message: string;
}

export type ExtensionMessage =
  | NeutralizeProductInfoRequest
  | NeutralizeProductValuesRequest
  | NeutralizeProductInfoResponse
  | NeutralizeProductValuesResponse
  | NeutralizeProductInfoErrorResponse;

export function toValueOnlyProductInfo(
  productInfo: ProductInfo,
): ProductInfoValueOnly {
  return PRODUCT_INFO_FIELDS.reduce<ProductInfoValueOnly>((values, field) => {
    const element = productInfo[field];

    if (isProductElement(element)) {
      values[field] = element.value;
    }

    return values;
  }, {});
}

export function mergeNeutralizedValuesIntoProductInfo(
  originalProductInfo: ProductInfo,
  neutralizedValues: NeutralizedProductValues,
): ProductInfo {
  return PRODUCT_INFO_FIELDS.reduce<ProductInfo>((nextProductInfo, field) => {
    const originalElement = originalProductInfo[field];
    const neutralizedValue = neutralizedValues[field];

    if (!isProductElement(originalElement)) {
      return nextProductInfo;
    }

    nextProductInfo[field] = {
      id: originalElement.id,
      value:
        typeof neutralizedValue === "string"
          ? neutralizedValue
          : originalElement.value,
    };

    return nextProductInfo;
  }, { name: originalProductInfo.name });
}

export function isProductElement(value: unknown): value is ProductElement {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "value" in value &&
    typeof value.id === "string" &&
    typeof value.value === "string"
  );
}
