import {
  createDecisionSession,
  isDecisionEvent,
  isDecisionSession,
} from "../shared/decisionReplay.ts";

export const DECISION_REPLAY_KEY = "decisionReplaySession";
export const MAX_DECISION_EVENTS = 500;

export async function loadDecisionSession(storage = chrome.storage.local) {
  const stored = await storage.get(DECISION_REPLAY_KEY);
  const value = stored?.[DECISION_REPLAY_KEY];
  if (isDecisionSession(value)) return value;
  const session = createDecisionSession();
  await storage.set({ [DECISION_REPLAY_KEY]: session });
  return session;
}

export async function appendDecisionEvent(
  event,
  storage = chrome.storage.local,
) {
  if (!isDecisionEvent(event)) throw new Error("Invalid Decision Replay event.");
  const session = await loadDecisionSession(storage);
  if (session.events.some((candidate) => candidate.id === event?.id)) {
    return session;
  }
  const next = {
    ...session,
    endedAt: undefined,
    events: [...session.events, event].slice(-MAX_DECISION_EVENTS),
  };
  await storage.set({ [DECISION_REPLAY_KEY]: next });
  return next;
}

export async function endDecisionSession(storage = chrome.storage.local) {
  const session = await loadDecisionSession(storage);
  const next = { ...session, endedAt: Date.now() };
  await storage.set({ [DECISION_REPLAY_KEY]: next });
  return next;
}

export async function resetDecisionSession(storage = chrome.storage.local) {
  const session = createDecisionSession();
  await storage.set({ [DECISION_REPLAY_KEY]: session });
  return session;
}