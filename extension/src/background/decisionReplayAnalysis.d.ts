import type { DecisionSession, ReplayAnalysisPayload } from "../shared/decisionReplay.js";

export type DecisionReplayAnalysisResult =
  | { ok: true; payload: ReplayAnalysisPayload; analysis: unknown }
  | { ok: false; payload: ReplayAnalysisPayload; message: string };
export function analyzeDecisionReplay(
  session: DecisionSession,
  dependencies?: { storage?: chrome.storage.StorageArea; fetchImpl?: typeof fetch },
): Promise<DecisionReplayAnalysisResult>;
export function parseDecisionAnalysis(text: string): unknown;
