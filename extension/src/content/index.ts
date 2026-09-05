import { TemuProductAdapter } from "../adapters/temuProductAdapter";
import { TemuSearchAdapter } from "../adapters/temuSearchAdapter";
import {
  applyInlineRebuild,
  type InlineRebuildHandle,
} from "./inlineRebuilder";
import type {
  ContentScriptErrorResponse,
  NeutralizeProductValuesResponse,
  ProductInfo,
  ProductInfoValueOnly,
  RebuildCurrentProductResponse,
  RestoreCurrentProductResponse,
  PriceComparisonErrorResponse,
  PriceComparisonResult,
} from "../shared/productInfo";
import {
  isContentScriptRequest,
  isNeutralizeProductInfoErrorResponse,
  isNeutralizeProductValuesResponse,
  mergeNeutralizedValuesIntoProductInfo,
  toValueOnlyProductInfo,
} from "../shared/productInfo";
import {
  loadUserNeed,
  USER_NEED_STORAGE_KEY,
  type UserNeed,
} from "../shared/userNeed";
import {
  type ComparableProduct,
  parsePrice,
  selectRandomProducts,
  summarizePrices,
} from "../shared/priceComparison";

const productAdapter = new TemuProductAdapter();
const searchAdapter = new TemuSearchAdapter();
const SEARCH_STATE_KEY = "dehype-price-search-state";
const EXTRACTION_TIMEOUT_MS = 1_500;
const EXTRACTION_DEBOUNCE_MS = 75;
const NEED_MATCH_TRIGGER_DEBOUNCE_MS = 250;

interface WaitOptions {
  timeoutMs?: number;
  debounceMs?: number;
  getPageUrl?: () => string;
  observerFactory?: (
    callback: MutationCallback,
  ) => Pick<MutationObserver, "observe" | "disconnect">;
}

type ContentResponse =
  | RebuildCurrentProductResponse
  | RestoreCurrentProductResponse
  | ContentScriptErrorResponse
  | PriceComparisonResult
  | PriceComparisonErrorResponse;

let activeRebuild: InlineRebuildHandle | undefined;
let activeResponse: RebuildCurrentProductResponse | undefined;
let stopNavigationMonitor: (() => void) | undefined;
let pendingNeedMatchTimer: number | undefined;
let lastNeedMatchSignature = "";
let lastObservedUrl =
  typeof window !== "undefined" ? window.location.href : "";

export function extractCurrentProduct(
  sourceDocument: Document,
  pageUrl: string = window.location.href,
): ProductInfo | undefined {
  if (!productAdapter.isSupportedPage(pageUrl)) return undefined;
  return productAdapter.extractProductInfo(sourceDocument, pageUrl);
}

export async function waitForCurrentProduct(
  sourceDocument: Document,
  options: WaitOptions = {},
): Promise<ProductInfo | undefined> {
  const getPageUrl = options.getPageUrl ?? (() => window.location.href);
  const timeoutMs = options.timeoutMs ?? EXTRACTION_TIMEOUT_MS;
  const debounceMs = options.debounceMs ?? EXTRACTION_DEBOUNCE_MS;
  const observerFactory =
    options.observerFactory ??
    ((callback: MutationCallback) => new MutationObserver(callback));
  const firstUrl = getPageUrl();
  if (!productAdapter.isSupportedPage(firstUrl)) return undefined;

  let latest = tryExtract(sourceDocument, firstUrl);
  if (latest?.currentPrice) return latest;

  return new Promise((resolve) => {
    let debounceTimer: number | undefined;
    let settled = false;
    const finish = (product: ProductInfo | undefined): void => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timeoutTimer);
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      resolve(product);
    };
    const check = (): void => {
      const url = getPageUrl();
      if (!productAdapter.isSupportedPage(url)) {
        finish(undefined);
        return;
      }
      latest = tryExtract(sourceDocument, url) ?? latest;
      if (latest?.currentPrice) finish(latest);
    };
    const observer = observerFactory(() => {
      if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(check, debounceMs);
    });
    const timeoutTimer = window.setTimeout(() => finish(latest), timeoutMs);

    observer.observe(sourceDocument.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });
}

export async function rebuildCurrentProduct(): Promise<ContentResponse> {
  if (activeResponse && activeRebuild?.targetsAreConnected()) return activeResponse;
  if (activeRebuild) restoreCurrentProduct();

  const productInfo = await waitForCurrentProduct(document);
  if (!productInfo) {
    return errorResponse(
      "rebuild",
      "Open a supported Temu product detail page and try again.",
    );
  }

  let pendingRebuild: InlineRebuildHandle | undefined;
  try {
    const neutralized = await requestNeutralizedValues(
      toValueOnlyProductInfo(productInfo),
    );
    const neutralizedProductInfo = mergeNeutralizedValuesIntoProductInfo(
      productInfo,
      neutralized.productValues,
    );
    const neutralLayoutRoot = productAdapter.findNeutralLayoutRoot(document);
    const rebuildOptions = {
      source: neutralized.source,
      findNeutralizationTargets: () =>
        productAdapter.findNeutralizationTargets(document),
      onRestore: restoreCurrentProduct,
      ...(neutralLayoutRoot ? { neutralLayoutRoot } : {}),
      ...(neutralized.fallbackReason
        ? { fallbackReason: neutralized.fallbackReason }
        : {}),
    };
    const rebuild = applyInlineRebuild(
      document,
      neutralizedProductInfo,
      rebuildOptions,
    );
    pendingRebuild = rebuild;

    if (rebuild.appliedFields.length === 0) {
      rebuild.restore();
      return errorResponse(
        "rebuild",
        "Product values were analyzed, but no visible Temu product fields could be rebuilt.",
      );
    }

    const response: RebuildCurrentProductResponse = {
      type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT",
      productInfo: neutralizedProductInfo,
      source: neutralized.source,
      appliedFields: rebuild.appliedFields,
      suppressedElementCount: rebuild.suppressedElementCount,
      deemphasizedElementCount: rebuild.deemphasizedElementCount,
    };
    if (neutralized.fallbackReason) {
      response.fallbackReason = neutralized.fallbackReason;
    }
    activeRebuild = rebuild;
    activeResponse = response;
    startNavigationMonitor(window.location.href);
    pendingRebuild = undefined;
    return response;
  } catch (error) {
    pendingRebuild?.restore();
    return errorResponse(
      "rebuild",
      error instanceof Error ? error.message : String(error),
    );
  }
}

export function restoreCurrentProduct(): RestoreCurrentProductResponse {
  activeRebuild?.restore();
  activeRebuild = undefined;
  activeResponse = undefined;
  stopNavigationMonitor?.();
  stopNavigationMonitor = undefined;
  return { type: "DEHYPE_RESTORE_CURRENT_PRODUCT_RESULT" };
}

export async function analyzeCurrentProductNeedMatch(
  options: WaitOptions = {},
): Promise<boolean> {
  const userNeed = await loadCurrentUserNeed();
  if (!userNeed) return false;

  const productInfo = await waitForCurrentProduct(document, options);
  if (!productInfo) return false;

  const productValues = toValueOnlyProductInfo(productInfo);
  const signature = needMatchSignature(
    window.location.href,
    productValues,
    userNeed,
  );
  if (signature === lastNeedMatchSignature) return false;

  lastNeedMatchSignature = signature;
  await chrome.runtime.sendMessage({
    type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES",
    productValues,
  });
  return true;
}

export function handleContentMessage(
  message: unknown,
  sendResponse: (response: ContentResponse) => void,
): boolean {
  if (!isContentScriptRequest(message)) return false;

  if (message.type === "DEHYPE_RETURN_FROM_SEARCH") {
    returnFromSearch();
    sendResponse({ type: "DEHYPE_PRICE_COMPARISON_ERROR", message: "Returning to the original product page." });
    return false;
  }

  if (message.type === "DEHYPE_RESTORE_CURRENT_PRODUCT") {
    sendResponse(restoreCurrentProduct());
    return false;
  }

  if (message.type === "DEHYPE_PRICE_COMPARISON") {
    void compareCurrentProduct().then(sendResponse);
    return true;
  }

  void rebuildCurrentProduct().then(sendResponse);
  return true;
}

export async function searchTemu(keyword: string): Promise<unknown> {
  const pageUrl = new URL(window.location.href);
  const localePrefix = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)\//i.test(pageUrl.pathname)
    ? pageUrl.pathname.split("/").slice(0, 2).join("/")
    : "";
  const pageSn = pageUrl.pathname.includes("search_result") ? 10009 : 10032;
  const response = await fetch(
    `${pageUrl.origin}${localePrefix}/api/poppy/v2/search_activation?scene=search_activation`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scene: "search_activation",
        listId: crypto.randomUUID().replaceAll("-", ""),
        pageSn,
        moduleCustomReqMap: { "200256": { pageSize: 50, offset: 0 } },
        historical_words: [],
        query: keyword,
      }),
    },
  );
  const responseBody: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const apiError = isRecord(responseBody) && isRecord(responseBody.result)
      ? responseBody.result
      : responseBody;
    const errorCode = isRecord(responseBody) &&
      typeof responseBody.error_code === "number"
      ? `, error_code ${responseBody.error_code}`
      : "";
    const message = isRecord(apiError) && typeof apiError.message === "string"
      ? apiError.message
      : response.status === 429
        ? "Temu temporarily rate-limited this browser session. Try again later."
        : "Temu rejected the request.";
    throw new Error(`Temu Search API failed (${response.status}${errorCode}): ${message}`);
  }
  return responseBody;
}

async function compareCurrentProduct(): Promise<ContentResponse> {
  try {
    const productInfo = await waitForCurrentProduct(document);
    if (!productInfo) throw new Error("No supported Temu product was found on this page.");
    const keywordResponse: unknown = await chrome.runtime.sendMessage({
      type: "DEHYPE_GENERATE_SEARCH_KEYWORD",
      productName: productInfo.name.value,
    });
    if (!isKeywordResponse(keywordResponse)) {
      throw new Error(isErrorResponse(keywordResponse) ? keywordResponse.message : "The keyword service returned an invalid response.");
    }
    const rawResponse = await searchTemu(keywordResponse.searchKeyword);
    const products = extractComparableProducts(rawResponse);
    const selectedProducts = selectRandomProducts(products);
    const summary = summarizePrices(selectedProducts.map(({ price }) => price));
    if (!summary) throw new Error("Temu returned no products with valid prices.");
    return {
      type: "DEHYPE_PRICE_COMPARISON_RESULT",
      source: "api",
      productName: productInfo.name.value,
      searchKeyword: keywordResponse.searchKeyword,
      products: selectedProducts,
      ...summary,
    };
  } catch (error) {
    if (isRateLimitError(error)) {
      const productInfo = await waitForCurrentProduct(document);
      if (productInfo) {
        beginDomSearch(productInfo, await getSearchKeyword(productInfo.name.value));
        return {
          type: "DEHYPE_PRICE_COMPARISON_ERROR",
          message: "Temu API is rate-limited. Opening the Temu search page to compare rendered results.",
        };
      }
    }
    return {
      type: "DEHYPE_PRICE_COMPARISON_ERROR",
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function getSearchKeyword(productName: string): Promise<string> {
  const response: unknown = await chrome.runtime.sendMessage({
    type: "DEHYPE_GENERATE_SEARCH_KEYWORD",
    productName,
  });
  if (isKeywordResponse(response)) return response.searchKeyword;
  throw new Error(isErrorResponse(response) ? response.message : "The keyword service returned an invalid response.");
}

function beginDomSearch(productInfo: ProductInfo, keyword: string): void {
  sessionStorage.setItem(SEARCH_STATE_KEY, JSON.stringify({
    originalUrl: window.location.href,
    productName: productInfo.name.value,
    keyword,
  }));
  window.location.assign(searchAdapter.buildSearchUrl(keyword, window.location.href));
}

async function resumeDomSearch(): Promise<void> {
  if (!searchAdapter.isSearchPage(window.location.href)) return;
  const rawState = sessionStorage.getItem(SEARCH_STATE_KEY);
  if (!rawState) return;
  let state: { originalUrl: string; productName: string; keyword: string };
  try {
    state = JSON.parse(rawState) as typeof state;
  } catch {
    sessionStorage.removeItem(SEARCH_STATE_KEY);
    return;
  }
  const products = await waitForSearchProducts();
  const selectedProducts = selectRandomProducts(products);
  const summary = summarizePrices(selectedProducts.map(({ price }) => price));
  if (!summary) {
    chrome.runtime.sendMessage({
      type: "DEHYPE_PRICE_COMPARISON_ERROR",
      message: "Temu search page loaded, but no products with readable prices were found.",
    });
    return;
  }
  chrome.runtime.sendMessage({
    type: "DEHYPE_PRICE_COMPARISON_RESULT",
    source: "dom",
    productName: state.productName,
    searchKeyword: state.keyword,
    products: selectedProducts,
    ...summary,
  });
}

function waitForSearchProducts(): Promise<ComparableProduct[]> {
  const first = searchAdapter.extractProducts(document);
  if (first.length > 0) return Promise.resolve(first);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => finish(searchAdapter.extractProducts(document)), 10_000);
    const observer = new MutationObserver(() => {
      const products = searchAdapter.extractProducts(document);
      if (products.length > 0) finish(products);
    });
    const finish = (products: ComparableProduct[]): void => {
      observer.disconnect();
      if (timer !== undefined) window.clearTimeout(timer);
      resolve(products);
    };
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

function returnFromSearch(): void {
  const rawState = sessionStorage.getItem(SEARCH_STATE_KEY);
  sessionStorage.removeItem(SEARCH_STATE_KEY);
  if (!rawState) return;
  try {
    const state = JSON.parse(rawState) as { originalUrl?: string };
    if (typeof state.originalUrl === "string" && productAdapter.isSupportedPage(state.originalUrl)) {
      window.location.assign(state.originalUrl);
    }
  } catch {
    // Ignore malformed transient search state.
  }
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /429|40002|rate-limited/i.test(error.message);
}

function extractComparableProducts(response: unknown) {
  const goodsList = isRecord(response) && isRecord(response.result) &&
    isRecord(response.result.data) && Array.isArray(response.result.data.goods_list)
    ? response.result.data.goods_list
    : [];
  return goodsList.flatMap((goods): ComparableProduct[] => {
    const product = parseComparableProduct(goods);
    return product ? [product] : [];
  });
}

function parseComparableProduct(goods: unknown): ComparableProduct | undefined {
  if (!isRecord(goods) || !isRecord(goods.price_info)) return undefined;
  const parsedPrice = parsePrice(goods.price_info.price_str);
  const name = typeof goods.goods_name === "string" ? goods.goods_name.trim() : "";
  if (!parsedPrice || !name) return undefined;
  return {
    ...parsedPrice,
    name,
    ...(typeof goods.goods_id === "string" ? { productId: goods.goods_id } : {}),
    ...(typeof goods.goods_url === "string" ? { productUrl: goods.goods_url } : {}),
  };
}

function isKeywordResponse(value: unknown): value is { searchKeyword: string } {
  return isRecord(value) && value.type === "DEHYPE_GENERATE_SEARCH_KEYWORD_RESULT" &&
    typeof value.searchKeyword === "string" && value.searchKeyword.length > 0;
}

function isErrorResponse(value: unknown): value is { message: string } {
  return isRecord(value) && value.type === "DEHYPE_PRICE_COMPARISON_ERROR" &&
    typeof value.message === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function tryExtract(sourceDocument: Document, pageUrl: string): ProductInfo | undefined {
  try {
    return extractCurrentProduct(sourceDocument, pageUrl);
  } catch {
    return undefined;
  }
}

async function requestNeutralizedValues(
  productValues: ProductInfoValueOnly,
): Promise<NeutralizeProductValuesResponse> {
  const response: unknown = await chrome.runtime.sendMessage({
    type: "DEHYPE_NEUTRALIZE_VALUES",
    productValues,
  });

  if (isNeutralizeProductValuesResponse(response)) return response;
  if (isNeutralizeProductInfoErrorResponse(response)) {
    throw new Error(response.message);
  }
  throw new Error("The analysis service returned an invalid response.");
}

function startNavigationMonitor(pageUrl: string): void {
  stopNavigationMonitor?.();
  const checkUrl = (): void => {
    if (
      window.location.href !== pageUrl ||
      !activeRebuild?.targetsAreConnected()
    ) {
      restoreCurrentProduct();
      return;
    }
    activeRebuild.neutralizeNewElements();
  };
  const observer = new MutationObserver(checkUrl);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", checkUrl);
  window.addEventListener("hashchange", checkUrl);
  stopNavigationMonitor = () => {
    observer.disconnect();
    window.removeEventListener("popstate", checkUrl);
    window.removeEventListener("hashchange", checkUrl);
  };
}

function startNeedMatchAutomation(): void {
  if (!chrome.storage?.local || !chrome.storage.onChanged) return;

  window.__dehypeStopNeedMatchAutomation?.();

  const storageListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "local" || !(USER_NEED_STORAGE_KEY in changes)) {
      return;
    }

    if (changes[USER_NEED_STORAGE_KEY]?.newValue === undefined) {
      lastNeedMatchSignature = "";
      return;
    }

    scheduleNeedMatchAnalysis();
  };
  chrome.storage.onChanged.addListener(storageListener);

  patchHistoryNavigation();
  window.addEventListener("popstate", handlePossibleProductNavigation);
  window.addEventListener("hashchange", handlePossibleProductNavigation);
  const observer = new MutationObserver(handlePossibleProductNavigation);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.__dehypeStopNeedMatchAutomation = () => {
    if (pendingNeedMatchTimer !== undefined) {
      window.clearTimeout(pendingNeedMatchTimer);
      pendingNeedMatchTimer = undefined;
    }
    observer.disconnect();
    window.removeEventListener("popstate", handlePossibleProductNavigation);
    window.removeEventListener("hashchange", handlePossibleProductNavigation);
    if (typeof chrome !== "undefined") {
      chrome.storage?.onChanged?.removeListener?.(storageListener);
    }
  };

  if (window.__dehypeSkipInitialNeedMatch) {
    window.__dehypeSkipInitialNeedMatch = false;
  } else {
    scheduleNeedMatchAnalysis();
  }
}

function scheduleNeedMatchAnalysis(): void {
  if (pendingNeedMatchTimer !== undefined) {
    window.clearTimeout(pendingNeedMatchTimer);
  }

  pendingNeedMatchTimer = window.setTimeout(() => {
    pendingNeedMatchTimer = undefined;
    void analyzeCurrentProductNeedMatch().catch(() => {
      // Background stores user-visible Need Match failures when analysis starts.
    });
  }, NEED_MATCH_TRIGGER_DEBOUNCE_MS);
}

function handlePossibleProductNavigation(): void {
  if (typeof window === "undefined") return;
  if (window.location.href === lastObservedUrl) return;
  lastObservedUrl = window.location.href;
  restoreCurrentProduct();
  scheduleNeedMatchAnalysis();
}

function patchHistoryNavigation(): void {
  if (window.__dehypeNeedMatchHistoryPatched) return;
  window.__dehypeNeedMatchHistoryPatched = true;

  const originalPushState = history.pushState;
  history.pushState = function pushState(
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalPushState.apply(this, [data, unused, url]);
    handlePossibleProductNavigation();
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function replaceState(
    this: History,
    data: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    originalReplaceState.apply(this, [data, unused, url]);
    handlePossibleProductNavigation();
  };
}

async function loadCurrentUserNeed(): Promise<UserNeed | null> {
  try {
    return await loadUserNeed(chrome.storage.local);
  } catch {
    return null;
  }
}

function needMatchSignature(
  pageUrl: string,
  productValues: ProductInfoValueOnly,
  userNeed: UserNeed,
): string {
  return JSON.stringify({ pageUrl, productValues, userNeed });
}

function errorResponse(
  operation: "rebuild" | "restore",
  message: string,
): ContentScriptErrorResponse {
  return { type: "DEHYPE_CONTENT_SCRIPT_ERROR", operation, message };
}

if (
  typeof chrome !== "undefined" &&
  chrome.runtime?.onMessage &&
  !window.__dehypeContentScriptInitialized
) {
  window.__dehypeContentScriptInitialized = true;
  chrome.runtime.onMessage.addListener(
    (message: unknown, _sender, sendResponse): boolean =>
      handleContentMessage(message, sendResponse),
  );
  startNeedMatchAutomation();
  void resumeDomSearch();
}

declare global {
  interface Window {
    __dehypeContentScriptInitialized?: boolean;
    __dehypeNeedMatchHistoryPatched?: boolean;
    __dehypeSkipInitialNeedMatch?: boolean;
    __dehypeStopNeedMatchAutomation?: () => void;
  }
}
