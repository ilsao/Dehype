import { TemuProductAdapter } from "../adapters/temuProductAdapter";
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

const productAdapter = new TemuProductAdapter();
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
  | ContentScriptErrorResponse;

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

  if (message.type === "DEHYPE_RESTORE_CURRENT_PRODUCT") {
    sendResponse(restoreCurrentProduct());
    return false;
  }

  void rebuildCurrentProduct().then(sendResponse);
  return true;
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
}

declare global {
  interface Window {
    __dehypeContentScriptInitialized?: boolean;
    __dehypeNeedMatchHistoryPatched?: boolean;
    __dehypeSkipInitialNeedMatch?: boolean;
    __dehypeStopNeedMatchAutomation?: () => void;
  }
}
