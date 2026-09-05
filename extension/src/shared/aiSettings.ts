export const AI_SETTINGS_KEY = "aiSettings";

export const AI_PROVIDERS = ["openai", "gemini", "claude"] as const;

export type AiProvider = (typeof AI_PROVIDERS)[number];

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AiSettingsStatus {
  healthy: boolean;
  configured: boolean;
}

export interface StorageReaderLike {
  get(key: string): Promise<Record<string, unknown>>;
}

export interface StorageAreaLike extends StorageReaderLike {
  set(items: Record<string, unknown>): Promise<unknown>;
}

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.5-flash-lite",
  claude: "claude-3-5-haiku-latest",
};

export function defaultModelForProvider(provider: string): string {
  return isAiProvider(provider) ? DEFAULT_MODELS[provider] : "";
}

export function validateAiSettings(value: unknown): AiSettings {
  if (!value || typeof value !== "object") {
    throw new Error("Enter and save your AI settings.");
  }

  const candidate = value as Record<string, unknown>;
  const provider =
    typeof candidate.provider === "string" ? candidate.provider : "";
  const model =
    typeof candidate.model === "string" ? candidate.model.trim() : "";
  const apiKey =
    typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : "";

  if (!isAiProvider(provider)) {
    throw new Error("Choose ChatGPT, Gemini, or Claude.");
  }

  if (!model) {
    throw new Error("Enter a model name.");
  }

  if (!apiKey) {
    throw new Error("Enter an API key.");
  }

  return { provider, model, apiKey };
}

export async function loadAiSettings(
  storageArea: StorageReaderLike,
): Promise<AiSettings | null> {
  const stored = await storageArea.get(AI_SETTINGS_KEY);

  if (!stored[AI_SETTINGS_KEY]) {
    return null;
  }

  try {
    return validateAiSettings(stored[AI_SETTINGS_KEY]);
  } catch {
    return null;
  }
}

export async function saveAiSettings(
  storageArea: StorageAreaLike,
  value: unknown,
): Promise<AiSettings> {
  const settings = validateAiSettings(value);
  await storageArea.set({ [AI_SETTINGS_KEY]: settings });
  return settings;
}

export async function getAiSettingsStatus(
  storageArea: StorageReaderLike,
): Promise<AiSettingsStatus> {
  try {
    const settings = await loadAiSettings(storageArea);
    const configured = settings !== null;

    return { healthy: configured, configured };
  } catch {
    return { healthy: false, configured: false };
  }
}

function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}
