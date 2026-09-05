export const AI_SETTINGS_KEY = "aiSettings";
export const AI_SETTINGS_VERSION = 2;
export const AI_REMOTE_CONSENT_VERSION = 1;
export const AI_PROVIDERS = ["openai", "gemini", "claude"];

export const DEFAULT_MODELS = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.5-flash-lite",
  claude: "claude-3-5-haiku-latest",
};

export const PROVIDER_ORIGINS = {
  openai: "https://api.openai.com/*",
  gemini: "https://generativelanguage.googleapis.com/*",
  claude: "https://api.anthropic.com/*",
};

export function defaultModelForProvider(provider) {
  return DEFAULT_MODELS[provider] ?? "";
}

export function validateAiSettings(value) {
  if (!value || typeof value !== "object") {
    return { version: AI_SETTINGS_VERSION, state: "unconfigured" };
  }

  if (
    value.version === AI_SETTINGS_VERSION &&
    value.state === "unconfigured"
  ) {
    return copyOptionalCredentials(value, {
      version: AI_SETTINGS_VERSION,
      state: "unconfigured",
    });
  }

  if (value.version === AI_SETTINGS_VERSION && value.state === "remote") {
    if (value.consentVersion !== AI_REMOTE_CONSENT_VERSION) {
      throw new Error("Consent is required before product data can be sent.");
    }
    return {
      version: AI_SETTINGS_VERSION,
      state: "remote",
      ...validateRemoteCredentials(value),
      consentVersion: AI_REMOTE_CONSENT_VERSION,
    };
  }

  if (
    value.version === 1 &&
    value.mode === "remote" &&
    value.consentVersion === AI_REMOTE_CONSENT_VERSION
  ) {
    return {
      version: AI_SETTINGS_VERSION,
      state: "remote",
      ...validateRemoteCredentials(value),
      consentVersion: AI_REMOTE_CONSENT_VERSION,
    };
  }

  // Legacy local records may prefill valid credentials, but consent and remote
  // analysis must never be inferred from them.
  if (
    value.version === undefined ||
    (value.version === 1 && value.mode === "local")
  ) {
    return copyOptionalCredentials(value, {
      version: AI_SETTINGS_VERSION,
      state: "unconfigured",
    });
  }

  throw new Error("The saved AI settings use an unsupported version.");
}

export async function loadAiSettings(storageArea) {
  const stored = await storageArea.get(AI_SETTINGS_KEY);
  const value = stored[AI_SETTINGS_KEY];
  if (!value) return { version: AI_SETTINGS_VERSION, state: "unconfigured" };

  try {
    const settings = validateAiSettings(value);
    if (JSON.stringify(settings) !== JSON.stringify(value)) {
      await storageArea.set({ [AI_SETTINGS_KEY]: settings });
    }
    return settings;
  } catch {
    await storageArea.remove?.(AI_SETTINGS_KEY);
    return { version: AI_SETTINGS_VERSION, state: "unconfigured" };
  }
}

export async function saveAiSettings(storageArea, value) {
  const settings = validateAiSettings(value);
  await storageArea.set({ [AI_SETTINGS_KEY]: settings });
  return settings;
}

export async function getAiSettingsStatus(storageArea) {
  try {
    const settings = await loadAiSettings(storageArea);
    return {
      healthy: true,
      configured: settings.state === "remote",
      mode: settings.state,
    };
  } catch {
    return { healthy: false, configured: false, mode: "unconfigured" };
  }
}

export async function requestProviderPermission(permissionsApi, provider) {
  const origin = PROVIDER_ORIGINS[provider];
  if (!origin) throw new Error("Choose ChatGPT, Gemini, or Claude.");
  return permissionsApi.request({ origins: [origin] });
}

export async function revokeUnusedProviderPermissions(
  permissionsApi,
  activeProvider = null,
) {
  const retainedOrigin = activeProvider ? PROVIDER_ORIGINS[activeProvider] : null;
  const origins = Object.values(PROVIDER_ORIGINS).filter(
    (origin) => origin !== retainedOrigin,
  );
  if (origins.length > 0) await permissionsApi.remove({ origins });
}

function validateRemoteCredentials(value) {
  const provider = typeof value.provider === "string" ? value.provider : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";

  if (!AI_PROVIDERS.includes(provider)) {
    throw new Error("Choose ChatGPT, Gemini, or Claude.");
  }
  if (!model) throw new Error("Enter a model name.");
  if (!apiKey) throw new Error("Enter an API key.");
  return { provider, model, apiKey };
}

function copyOptionalCredentials(value, base) {
  try {
    return { ...base, ...validateRemoteCredentials(value) };
  } catch {
    return base;
  }
}
