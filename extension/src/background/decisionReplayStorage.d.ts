import type { DecisionEvent, DecisionSession } from "../shared/decisionReplay.js";

export const DECISION_REPLAY_KEY: "decisionReplaySession";
export const MAX_DECISION_EVENTS: number;
export function loadDecisionSession(storage?: chrome.storage.StorageArea): Promise<DecisionSession>;
export function appendDecisionEvent(event: DecisionEvent | Record<string, unknown>, storage?: chrome.storage.StorageArea): Promise<DecisionSession>;
export function endDecisionSession(storage?: chrome.storage.StorageArea): Promise<DecisionSession>;
export function resetDecisionSession(storage?: chrome.storage.StorageArea): Promise<DecisionSession>;
export function finishDecisionViewsForTab(tabId: number, leftAt?: number, storage?: chrome.storage.StorageArea): Promise<DecisionSession>;
