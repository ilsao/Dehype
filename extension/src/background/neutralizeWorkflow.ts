import {
  analyzeNeedMatch,
  neutralizeProductValues,
  type ProviderFetch,
} from "./aiProvider.js";
import { loadAiSettings, type StorageAreaLike } from "../shared/aiSettings.js";
import {
  saveNeedMatchAnalysis,
  saveNeedMatchAnalysisIfCurrent,
  type NeedMatchAnalysisState,
  type NeedMatchStorage,
} from "../shared/needMatch.js";
import type {
  NeutralizedProductValues,
  ProductInfoValueOnly,
} from "../shared/productInfo.js";
import { loadUserNeed, type UserNeedStorage } from "../shared/userNeed.js";

const MISSING_USER_NEED_MESSAGE =
  "Save your user needs in the Side Panel before running Need Match Analysis.";

type WorkflowStorage = StorageAreaLike & UserNeedStorage & NeedMatchStorage;

interface NeutralizeWorkflowOptions {
  productValues: ProductInfoValueOnly;
  storage: WorkflowStorage;
  fetchImpl?: ProviderFetch;
  createAnalysisId?: () => string;
}

export async function runNeutralizeWorkflow({
  productValues,
  storage,
  fetchImpl = fetch,
  createAnalysisId = () => crypto.randomUUID(),
}: NeutralizeWorkflowOptions): Promise<NeutralizedProductValues> {
  const analysisId = createAnalysisId();
  await trySaveAnalysis(storage, { state: "analyzing", analysisId });

  const settings = await loadAiSettings(storage);

  if (!settings) {
    await tryFinishAnalysis(storage, {
      state: "error",
      analysisId,
      message: "Open Dehype and save your AI provider, model, and API key.",
    });
    throw new Error("Open Dehype and save your AI provider, model, and API key.");
  }

  try {
    const userNeed = await loadUserNeed(storage);

    if (!userNeed) {
      await tryFinishAnalysis(storage, {
        state: "error",
        analysisId,
        message: MISSING_USER_NEED_MESSAGE,
      });
    } else {
      const result = await analyzeNeedMatch({
        settings,
        productValues,
        userNeed,
        fetchImpl,
      });
      await tryFinishAnalysis(storage, {
        state: "success",
        analysisId,
        result,
      });
    }
  } catch (error) {
    await tryFinishAnalysis(storage, {
      state: "error",
      analysisId,
      message: errorMessage(error),
    });
  }

  return neutralizeProductValues({
    settings,
    productValues,
    fetchImpl,
  });
}

async function trySaveAnalysis(
  storage: WorkflowStorage,
  state: NeedMatchAnalysisState,
): Promise<void> {
  try {
    await saveNeedMatchAnalysis(storage, state);
  } catch {
    // Need Match persistence must not prevent product neutralization.
  }
}

async function tryFinishAnalysis(
  storage: WorkflowStorage,
  state: Extract<NeedMatchAnalysisState, { state: "success" | "error" }>,
): Promise<void> {
  try {
    await saveNeedMatchAnalysisIfCurrent(storage, state);
  } catch {
    // Need Match persistence must not prevent product neutralization.
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
