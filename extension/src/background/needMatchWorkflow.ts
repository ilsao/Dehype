import { analyzeNeedMatch, type ProviderFetch } from "./aiProvider.js";
import { loadAiSettings, type StorageAreaLike } from "../shared/aiSettings.js";
import {
  saveNeedMatchAnalysis,
  saveNeedMatchAnalysisIfCurrent,
  type NeedMatchAnalysisState,
  type NeedMatchStorage,
} from "../shared/needMatch.js";
import type { ProductInfoValueOnly } from "../shared/productInfo.js";
import { loadUserNeed, type UserNeedStorage } from "../shared/userNeed.js";

const MISSING_USER_NEED_MESSAGE =
  "Save your user needs in the Side Panel before running Need Match Analysis.";

type WorkflowStorage = StorageAreaLike & UserNeedStorage & NeedMatchStorage;

interface NeedMatchWorkflowOptions {
  productValues: ProductInfoValueOnly;
  storage: WorkflowStorage;
  fetchImpl?: ProviderFetch;
  createAnalysisId?: () => string;
}

export async function runNeedMatchWorkflow({
  productValues,
  storage,
  fetchImpl = fetch,
  createAnalysisId = () => crypto.randomUUID(),
}: NeedMatchWorkflowOptions): Promise<NeedMatchAnalysisState> {
  const analysisId = createAnalysisId();
  await trySaveAnalysis(storage, { state: "analyzing", analysisId });

  try {
    const settings = await loadAiSettings(storage);
    if (settings.state !== "remote") {
      throw new Error("Open Dehype and save your AI provider, model, and API key.");
    }

    const userNeed = await loadUserNeed(storage);
    if (!userNeed) {
      throw new Error(MISSING_USER_NEED_MESSAGE);
    }

    const result = await analyzeNeedMatch({
      settings,
      productValues,
      userNeed,
      fetchImpl,
    });
    const success = { state: "success", analysisId, result } as const;
    await tryFinishAnalysis(storage, success);
    return success;
  } catch (error) {
    const failure = {
      state: "error",
      analysisId,
      message: errorMessage(error),
    } as const;
    await tryFinishAnalysis(storage, failure);
    return failure;
  }
}

async function trySaveAnalysis(
  storage: WorkflowStorage,
  state: NeedMatchAnalysisState,
): Promise<void> {
  try {
    await saveNeedMatchAnalysis(storage, state);
  } catch {
    // Need Match persistence failures are returned through the final state.
  }
}

async function tryFinishAnalysis(
  storage: WorkflowStorage,
  state: Extract<NeedMatchAnalysisState, { state: "success" | "error" }>,
): Promise<void> {
  try {
    await saveNeedMatchAnalysisIfCurrent(storage, state);
  } catch {
    // The caller only needs an acknowledgement; stale writes are intentionally ignored.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
