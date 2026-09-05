export const NEED_MATCH_STORAGE_KEY = "needMatchAnalysis";

export const NEED_MATCH_STATUSES = [
  "matched",
  "mismatched",
  "unknown",
] as const;

export type NeedMatchStatus = (typeof NEED_MATCH_STATUSES)[number];

export interface NeedMatchAssessment {
  status: NeedMatchStatus;
  explanation: string;
}

export interface NeedMatchItem extends NeedMatchAssessment {
  requirement: string;
}

export interface NeedMatchResult {
  productName: string;
  status: NeedMatchStatus;
  explanation: string;
  budget: NeedMatchAssessment | null;
  mustHave: NeedMatchItem[];
  niceToHave: NeedMatchItem[];
  exclude: NeedMatchItem[];
}

export type NeedMatchAnalysisState =
  | { state: "analyzing"; analysisId: string }
  | { state: "success"; analysisId: string; result: NeedMatchResult }
  | { state: "error"; analysisId: string; message: string };

export interface NeedMatchStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<unknown>;
  remove(key: string): Promise<unknown>;
}

export function validateNeedMatchAnalysisState(
  value: unknown,
): NeedMatchAnalysisState {
  if (!isRecord(value) || !isNonEmptyString(value.analysisId)) {
    throw new Error("Saved need match analysis is invalid.");
  }

  if (value.state === "analyzing") {
    return { state: "analyzing", analysisId: value.analysisId };
  }

  if (value.state === "error" && isNonEmptyString(value.message)) {
    return {
      state: "error",
      analysisId: value.analysisId,
      message: value.message.trim(),
    };
  }

  if (value.state === "success") {
    return {
      state: "success",
      analysisId: value.analysisId,
      result: validateNeedMatchResult(value.result),
    };
  }

  throw new Error("Saved need match analysis is invalid.");
}

export async function loadNeedMatchAnalysis(
  storage: Pick<NeedMatchStorage, "get">,
): Promise<NeedMatchAnalysisState | null> {
  const stored = await storage.get(NEED_MATCH_STORAGE_KEY);
  const value = stored[NEED_MATCH_STORAGE_KEY];

  return value === undefined ? null : validateNeedMatchAnalysisState(value);
}

export async function saveNeedMatchAnalysis(
  storage: Pick<NeedMatchStorage, "set">,
  state: NeedMatchAnalysisState,
): Promise<void> {
  await storage.set({
    [NEED_MATCH_STORAGE_KEY]: validateNeedMatchAnalysisState(state),
  });
}

export async function saveNeedMatchAnalysisIfCurrent(
  storage: Pick<NeedMatchStorage, "get" | "set">,
  state: Extract<NeedMatchAnalysisState, { state: "success" | "error" }>,
): Promise<boolean> {
  const current = await loadNeedMatchAnalysis(storage);

  if (current?.state !== "analyzing" || current.analysisId !== state.analysisId) {
    return false;
  }

  await saveNeedMatchAnalysis(storage, state);
  return true;
}

export async function clearNeedMatchAnalysis(
  storage: Pick<NeedMatchStorage, "remove">,
): Promise<void> {
  await storage.remove(NEED_MATCH_STORAGE_KEY);
}

function validateNeedMatchResult(value: unknown): NeedMatchResult {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.productName) ||
    !isNeedMatchStatus(value.status) ||
    !isNonEmptyString(value.explanation)
  ) {
    throw new Error("Saved need match result is invalid.");
  }

  return {
    productName: value.productName.trim(),
    status: value.status,
    explanation: value.explanation.trim(),
    budget: value.budget === null ? null : validateAssessment(value.budget),
    mustHave: validateItems(value.mustHave),
    niceToHave: validateItems(value.niceToHave),
    exclude: validateItems(value.exclude),
  };
}

function validateAssessment(value: unknown): NeedMatchAssessment {
  if (
    !isRecord(value) ||
    !isNeedMatchStatus(value.status) ||
    !isNonEmptyString(value.explanation)
  ) {
    throw new Error("Saved need match result is invalid.");
  }

  return { status: value.status, explanation: value.explanation.trim() };
}

function validateItems(value: unknown): NeedMatchItem[] {
  if (!Array.isArray(value)) {
    throw new Error("Saved need match result is invalid.");
  }

  return value.map((item) => {
    if (!isRecord(item) || !isNonEmptyString(item.requirement)) {
      throw new Error("Saved need match result is invalid.");
    }

    return {
      requirement: item.requirement.trim(),
      ...validateAssessment(item),
    };
  });
}

function isNeedMatchStatus(value: unknown): value is NeedMatchStatus {
  return NEED_MATCH_STATUSES.some((status) => status === value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
