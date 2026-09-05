import { neutralizeProductValues } from "./aiProvider.js";
import {
  getAiSettingsStatus,
  loadAiSettings,
} from "../shared/aiSettings.js";
import { isNeutralizeProductValuesRequest } from "../shared/productInfo.ts";
import {
  appendDecisionEvent,
  endDecisionSession,
  finishDecisionViewsForTab,
  loadDecisionSession,
  resetDecisionSession,
} from "./decisionReplayStorage.js";
import { analyzeDecisionReplay } from "./decisionReplayAnalysis.js";

if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "getStatus") {
      void getAiSettingsStatus(chrome.storage.local).then(sendResponse);
      return true;
    }

    if (message?.type === "DEHYPE_REPLAY_GET_SESSION") {
      void loadDecisionSession().then((session) =>
        sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session }),
      );
      return true;
    }

    if (message?.type === "DEHYPE_REPLAY_APPEND_EVENT") {
      const event = sender.tab?.id === undefined
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

    if (message?.type === "DEHYPE_REPLAY_END_SESSION") {
      void endDecisionSession().then((session) =>
        sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session }),
      );
      return true;
    }

    if (message?.type === "DEHYPE_REPLAY_RESET_SESSION") {
      void resetDecisionSession().then((session) =>
        sendResponse({ type: "DEHYPE_REPLAY_SESSION_RESULT", session }),
      );
      return true;
    }

    if (message?.type === "DEHYPE_REPLAY_ANALYZE") {
      void loadDecisionSession()
        .then((session) => analyzeDecisionReplay(session))
        .then((result) => sendResponse({ type: "DEHYPE_REPLAY_ANALYSIS_RESULT", result }))
        .catch((error) =>
          sendResponse({
            type: "DEHYPE_REPLAY_ANALYSIS_RESULT",
            result: { ok: false, message: error instanceof Error ? error.message : String(error) },
          }),
        );
      return true;
    }

    if (!isNeutralizeProductValuesRequest(message)) return false;

    void neutralizeWithSavedSettings(message.productValues)
      .then(({ productValues, source, fallbackReason }) => {
        const response = {
          type: "DEHYPE_NEUTRALIZE_VALUES_RESULT",
          productValues,
          source,
        };
        if (fallbackReason) response.fallbackReason = fallbackReason;
        sendResponse(response);
      })
      .catch((error) =>
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
    void finishDecisionViewsForTab(tabId).then((session) => {
      broadcastReplaySession(session);
    });
  });
}

async function finishOtherTabViews(event) {
  if (event?.action !== "PRODUCT_VIEW" || event.durationMs !== undefined) return;
  const session = await loadDecisionSession();
  const tabIds = new Set();
  let changed = false;
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
      leftAt: event.timestamp,
      durationMs: Math.max(0, event.timestamp - candidate.timestamp),
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
          leftAt: event.timestamp,
        });
      } catch {
        // The tab may have closed or no longer have a content script.
      }
    }),
  );
}

function broadcastReplaySession(session) {
  void chrome.runtime
    .sendMessage({ type: "DEHYPE_REPLAY_SESSION_UPDATED", session })
    .catch(() => {
      // No extension page may be listening while the side panel is closed.
    });
}

export async function neutralizeWithSavedSettings(productValues, dependencies = {}) {
  const storage = dependencies.storage ?? chrome.storage.local;
  const settings = await loadAiSettings(storage);

  if (settings.state !== "remote") {
    return {
      productValues: { ...productValues },
      source: "structural",
      fallbackReason: "Configure and consent to an AI provider to analyze product wording.",
    };
  }

  try {
    const modelValues = await neutralizeProductValues({
      settings,
      productValues,
      fetchImpl: dependencies.fetchImpl,
    });
    // A model may omit fields. Preserve original facts for omitted values and
    // overlay only validated model text.
    const modelOverlay = {
      ...productValues,
      ...modelValues,
    };
    // Prices and images are canonical local facts. The model may rewrite only
    // language fields and must never alter these values or introduce them.
    for (const field of ["originalPrice", "currentPrice", "image"]) {
      if (Object.hasOwn(productValues, field)) {
        modelOverlay[field] = productValues[field];
      } else {
        delete modelOverlay[field];
      }
    }
    return {
      productValues: modelOverlay,
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
