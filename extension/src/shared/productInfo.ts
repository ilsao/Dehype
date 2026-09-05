/** One extracted product field and the DOM node it came from. */
export interface ProductElement {
  /** A local identifier used only to map a value back to its source node. */
  id: string;
  /** Untrusted raw text or URL extracted from the active product page. */
  value: string;
}

export interface ProductInfo {
  name: ProductElement;
  originalPrice?: ProductElement;
  currentPrice?: ProductElement;
  discount?: ProductElement;
  image?: ProductElement;
  description?: ProductElement;
  stockAmount?: ProductElement;
}

export type ProductInfoField = keyof ProductInfo;
export type ProductInfoValueOnly = { [Field in ProductInfoField]?: string };
export type NeutralizedProductValues = ProductInfoValueOnly;
export type NeutralizeSource = "structural" | "model";

export const PRODUCT_INFO_FIELDS = [
  "name",
  "originalPrice",
  "currentPrice",
  "discount",
  "image",
  "description",
  "stockAmount",
] as const satisfies readonly ProductInfoField[];

export interface NeutralizeProductValuesRequest {
  type: "DEHYPE_NEUTRALIZE_VALUES";
  productValues: ProductInfoValueOnly;
}

export interface NeutralizeProductValuesResponse {
  type: "DEHYPE_NEUTRALIZE_VALUES_RESULT";
  productValues: NeutralizedProductValues;
  source: NeutralizeSource;
  fallbackReason?: string;
}

export interface NeutralizeProductInfoErrorResponse {
  type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR";
  message: string;
}

export interface RebuildCurrentProductRequest {
  type: "DEHYPE_REBUILD_CURRENT_PRODUCT";
}

export interface RestoreCurrentProductRequest {
  type: "DEHYPE_RESTORE_CURRENT_PRODUCT";
}

export interface RebuildCurrentProductResponse {
  type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT";
  productInfo: ProductInfo;
  source: NeutralizeSource;
  appliedFields: ProductInfoField[];
  suppressedElementCount: number;
  deemphasizedElementCount: number;
  fallbackReason?: string;
}

export interface RestoreCurrentProductResponse {
  type: "DEHYPE_RESTORE_CURRENT_PRODUCT_RESULT";
}

export interface ContentScriptErrorResponse {
  type: "DEHYPE_CONTENT_SCRIPT_ERROR";
  operation: "rebuild" | "restore";
  message: string;
}

export type ExtensionMessage =
  | NeutralizeProductValuesRequest
  | NeutralizeProductValuesResponse
  | NeutralizeProductInfoErrorResponse
  | RebuildCurrentProductRequest
  | RestoreCurrentProductRequest
  | RebuildCurrentProductResponse
  | RestoreCurrentProductResponse
  | ContentScriptErrorResponse;

export function toValueOnlyProductInfo(
  productInfo: ProductInfo,
): ProductInfoValueOnly {
  return PRODUCT_INFO_FIELDS.reduce<ProductInfoValueOnly>((values, field) => {
    const element = productInfo[field];
    if (isProductElement(element)) values[field] = element.value;
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
    if (!isProductElement(originalElement)) return nextProductInfo;

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
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.value === "string"
  );
}

export function isProductInfo(value: unknown): value is ProductInfo {
  if (
    !isRecord(value) ||
    !isProductElement(value.name) ||
    !value.name.value.trim()
  ) {
    return false;
  }
  return PRODUCT_INFO_FIELDS.filter((field) => field !== "name").every(
    (field) => value[field] === undefined || isProductElement(value[field]),
  );
}

export function isProductInfoValueOnly(
  value: unknown,
): value is ProductInfoValueOnly {
  if (!isRecord(value) || typeof value.name !== "string" || !value.name.trim()) {
    return false;
  }
  return Object.entries(value).every(
    ([field, fieldValue]) =>
      PRODUCT_INFO_FIELDS.includes(field as ProductInfoField) &&
      typeof fieldValue === "string",
  );
}

export function isNeutralizeProductValuesRequest(
  value: unknown,
): value is NeutralizeProductValuesRequest {
  return (
    isRecord(value) &&
    value.type === "DEHYPE_NEUTRALIZE_VALUES" &&
    isProductInfoValueOnly(value.productValues)
  );
}

export function isNeutralizeProductValuesResponse(
  value: unknown,
): value is NeutralizeProductValuesResponse {
  return (
    isRecord(value) &&
    value.type === "DEHYPE_NEUTRALIZE_VALUES_RESULT" &&
    isNeutralizedProductValues(value.productValues) &&
    (value.source === "structural" || value.source === "model") &&
    (value.fallbackReason === undefined ||
      typeof value.fallbackReason === "string")
  );
}

export function isNeutralizeProductInfoErrorResponse(
  value: unknown,
): value is NeutralizeProductInfoErrorResponse {
  return (
    isRecord(value) &&
    value.type === "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR" &&
    typeof value.message === "string" &&
    value.message.length > 0
  );
}

function isNeutralizedProductValues(
  value: unknown,
): value is NeutralizedProductValues {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.entries(value).every(
      ([field, fieldValue]) =>
        PRODUCT_INFO_FIELDS.includes(field as ProductInfoField) &&
        typeof fieldValue === "string",
    )
  );
}

export function isContentScriptRequest(
  value: unknown,
): value is RebuildCurrentProductRequest | RestoreCurrentProductRequest {
  return (
    isRecord(value) &&
    (value.type === "DEHYPE_REBUILD_CURRENT_PRODUCT" ||
      value.type === "DEHYPE_RESTORE_CURRENT_PRODUCT")
  );
}

export function isRebuildCurrentProductResponse(
  value: unknown,
): value is RebuildCurrentProductResponse {
  return (
    isRecord(value) &&
    value.type === "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT" &&
    isProductInfo(value.productInfo) &&
    (value.source === "structural" || value.source === "model") &&
    Array.isArray(value.appliedFields) &&
    value.appliedFields.length > 0 &&
    value.appliedFields.every(
      (field) =>
        typeof field === "string" &&
        field !== "image" &&
        PRODUCT_INFO_FIELDS.includes(field as ProductInfoField),
    ) &&
    new Set(value.appliedFields).size === value.appliedFields.length &&
    typeof value.suppressedElementCount === "number" &&
    Number.isInteger(value.suppressedElementCount) &&
    value.suppressedElementCount >= 0 &&
    typeof value.deemphasizedElementCount === "number" &&
    Number.isInteger(value.deemphasizedElementCount) &&
    value.deemphasizedElementCount >= 0 &&
    (value.fallbackReason === undefined ||
      typeof value.fallbackReason === "string")
  );
}

export function isContentScriptErrorResponse(
  value: unknown,
): value is ContentScriptErrorResponse {
  return (
    isRecord(value) &&
    value.type === "DEHYPE_CONTENT_SCRIPT_ERROR" &&
    (value.operation === "rebuild" || value.operation === "restore") &&
    typeof value.message === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
