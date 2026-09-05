import { runNeutralizeWorkflow } from "./neutralizeWorkflow.js";
import { runNeedMatchWorkflow } from "./needMatchWorkflow.js";
import type { ProviderFetch } from "./aiProvider.js";
import { getAiSettingsStatus } from "../shared/aiSettings.js";
import {
  appendDecisionEvent,
  endDecisionSession,
  finishDecisionViewsForTab,
  loadDecisionSession,
  resetDecisionSession,
} from "./decisionReplayStorage.js";
import { analyzeDecisionReplay } from "./decisionReplayAnalysis.js";
import {
  isAnalyzeNeedMatchValuesRequest,
  isNeutralizeProductValuesRequest,
  type AnalyzeNeedMatchValuesResponse,
  type NeutralizeProductValuesResponse,
  type NeutralizeSource,
  type ProductInfoValueOnly,
} from "../shared/productInfo.js";

interface NeutralizeWorkflowDependencies {
  storage?: chrome.storage.StorageArea;
  fetchImpl?: ProviderFetch;
  createAnalysisId?: () => string;
}

interface NeutralizeWorkflowResult {
  productValues: ProductInfoValueOnly;
  source: NeutralizeSource;
  fallbackReason?: string;
}

if (typeof chrome !== "undefined" && chrome.sidePanel?.setPanelBehavior) {
  void chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch(() => {
      // Chrome may reject this briefly while the extension is reloading.
    });
}

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isRecord(message) && message.type === "getStatus") {
      void getAiSettingsStatus(chrome.storage.local).then(sendResponse);
      return true;
    }

    if (isRecord(message) && message.type === "DEHYPE_REPLAY_GET_SESSION") {
      void loadDecisionSession().then((session) =>
        sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session }),
      );
      return true;
    }

    if (
      isRecord(message) &&
      message.type === "DEHYPE_REPLAY_APPEND_EVENT" &&
      isRecord(message.event)
    ) {
      const event =
        sender.tab?.id === undefined
          ? message.event
          : { ...message.event, tabId: sender.tab.id };
      void finishOtherTabViews(event)
        .then(() => appendDecisionEvent(event))
        .then((session) => {
          sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session });
          broadcastReplaySession(session);
        });
      return true;
    }

    if (isRecord(message) && message.type === "DEHYPE_REPLAY_END_SESSION") {
      void endDecisionSession().then((session) =>
        sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session }),
      );
      return true;
    }

    if (isRecord(message) && message.type === "DEHYPE_REPLAY_RESET_SESSION") {
      void resetDecisionSession().then((session) =>
        sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session }),
      );
      return true;
    }

    if (isRecord(message) && message.type === "DEHYPE_REPLAY_ANALYZE") {
      void loadDecisionSession()
        .then((session) => analyzeDecisionReplay(session))
        .then((result) =>
          sendResponse({ type: "DEHYPE_REPLAY_ANALYSIS_RESULT", result }),
        )
        .catch((error: unknown) =>
          sendResponse({
            type: "DEHYPE_REPLAY_ANALYSIS_RESULT",
            result: {
              ok: false,
              message: error instanceof Error ? error.message : String(error),
            },
          }),
        );
      return true;
    }

    if (isAnalyzeNeedMatchValuesRequest(message)) {
      void analyzeNeedMatchWithSavedSettings(message.productValues)
        .then((response) => sendResponse(response))
        .catch((error: unknown) =>
          sendResponse({
            type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES_RESULT",
            ok: false,
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      return true;
    }

    if (
      isRecord(message) &&
      message.type === "DEHYPE_GENERATE_SEARCH_KEYWORD" &&
      typeof message.productName === "string"
    ) {
      sendResponse({
        type: "DEHYPE_GENERATE_SEARCH_KEYWORD_RESULT",
        searchKeyword: localSearchKeyword(message.productName),
      });
      return false;
    }

    if (!isNeutralizeProductValuesRequest(message)) return false;

    void neutralizeWithSavedSettings(message.productValues)
      .then(({ productValues, source, fallbackReason }) => {
        const response: NeutralizeProductValuesResponse = {
          type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
          productValues,
          source,
          ...(fallbackReason ? { fallbackReason } : {}),
        };
        sendResponse(response);
      })
      .catch((error: unknown) =>
        sendResponse({
          type: "DEHYPE_NEUTRALIZE_PRODUCT_INFO_ERROR",
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    return true;
  });
}

if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void finishDecisionViewsForTab(tabId).then(broadcastReplaySession);
  });
}

async function finishOtherTabViews(event: Record<string, unknown>): Promise<void> {
  if (event.action !== "PRODUCT_VIEW" || event.durationMs !== undefined) return;
  const session = await loadDecisionSession();
  const tabIds = new Set<number>();
  let changed = false;
  const timestamp = typeof event.timestamp === "number" ? event.timestamp : Date.now();
  const events = session.events.map((candidate) => {
    if (
      candidate.action !== "PRODUCT_VIEW" ||
      candidate.durationMs !== undefined ||
      typeof candidate.tabId !== "number" ||
      candidate.tabId === event.tabId
    ) {
      return candidate;
    }
    tabIds.add(candidate.tabId);
    changed = true;
    return {
      ...candidate,
      leftAt: timestamp,
      durationMs: Math.max(0, timestamp - candidate.timestamp),
    };
  });
  if (changed) {
    const next = { ...session, events };
    await chrome.storage.local.set({ decisionReplaySession: next });
    broadcastReplaySession(next);
  }
  await Promise.all(
    [...tabIds].map(async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: "DEHYPE_REPLAY_STOP_VIEW",
          leftAt: timestamp,
        });
      } catch {
        // The tab may have closed or no longer have a content script.
      }
    }),
  );
}

function broadcastReplaySession(session: unknown): void {
  void chrome.runtime
    .sendMessage({ type: "DEHYPE_REPLAY_SESSION_UPDATED", session })
    .catch(() => {
      // No extension page may be listening while the side panel is closed.
    });
}

function localSearchKeyword(productName: string): string {
  const keyword = productName
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
  if (!keyword) throw new Error("Product information must include a product name.");
  return keyword;
}

export async function generateKeywordWithSavedSettings(productName: string): Promise<string> {
  return localSearchKeyword(productName);
}

export async function neutralizeWithSavedSettings(
  productValues: ProductInfoValueOnly,
  dependencies: NeutralizeWorkflowDependencies = {},
): Promise<NeutralizeWorkflowResult> {
  const storage = dependencies.storage ?? chrome.storage.local;
  try {
    const neutralizedValues = await runNeutralizeWorkflow({
      productValues,
      storage,
      ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    });

    return {
      productValues: overlayModelValues(productValues, neutralizedValues),
      source: "model",
    };
  } catch (error) {
    return {
      productValues: { ...productValues },
      source: "structural",
      fallbackReason:
        error instanceof Error
          ? error.message
          : "The model response could not be used.",
    };
  }
}

export async function analyzeNeedMatchWithSavedSettings(
  productValues: ProductInfoValueOnly,
  dependencies: NeutralizeWorkflowDependencies = {},
): Promise<AnalyzeNeedMatchValuesResponse> {
  const storage = dependencies.storage ?? chrome.storage.local;
  const analysis = await runNeedMatchWorkflow({
    productValues,
    storage,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.createAnalysisId
      ? { createAnalysisId: dependencies.createAnalysisId }
      : {}),
  });

  return {
    type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES_RESULT",
    ok: analysis.state === "success",
    ...(analysis.state === "error" ? { message: analysis.message } : {}),
  };
}

function overlayModelValues(
  productValues: ProductInfoValueOnly,
  modelValues: ProductInfoValueOnly,
): ProductInfoValueOnly {
  const modelOverlay: ProductInfoValueOnly = {
    ...productValues,
    ...modelValues,
  };

  for (const field of ["originalPrice", "currentPrice", "image"] as const) {
    const value = productValues[field];
    if (typeof value === "string") {
      modelOverlay[field] = value;
    } else {
      delete modelOverlay[field];
    }
  }

  return modelOverlay;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
