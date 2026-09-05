export const AI_SETTINGS_KEY = "aiSettings";

export const AI_PROVIDERS = ["openai", "gemini", "claude"];

export const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.5-flash-lite",
  claude: "claude-3-5-haiku-latest",
};

export function defaultModelForProvider(provider) {
  return DEFAULT_MODELS[provider] ?? "";
}

export function validateAiSettings(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Enter and save your AI settings.");
  }

  const provider = typeof value.provider === "string" ? value.provider : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";

  if (!AI_PROVIDERS.includes(provider)) {
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

export async function loadAiSettings(storageArea) {
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

export async function saveAiSettings(storageArea, value) {
  const settings = validateAiSettings(value);
  await storageArea.set({ [AI_SETTINGS_KEY]: settings });
  return settings;
}
