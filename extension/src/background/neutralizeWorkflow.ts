import {
  neutralizeProductValues,
  type ProviderFetch,
} from "./aiProvider.js";
import { loadAiSettings, type StorageAreaLike } from "../shared/aiSettings.js";
import type {
  NeutralizedProductValues,
  ProductInfoValueOnly,
} from "../shared/productInfo.js";

interface NeutralizeWorkflowOptions {
  productValues: ProductInfoValueOnly;
  storage: StorageAreaLike;
  fetchImpl?: ProviderFetch;
}

export async function runNeutralizeWorkflow({
  productValues,
  storage,
  fetchImpl = fetch,
}: NeutralizeWorkflowOptions): Promise<NeutralizedProductValues> {
  const settings = await loadAiSettings(storage);

  if (settings.state !== "remote") {
    throw new Error("Open Dehype and save your AI provider, model, and API key.");
  }

  return neutralizeProductValues({
    settings,
    productValues,
    fetchImpl,
  });
}
