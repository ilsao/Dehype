export const AI_SETTINGS_KEY = "aiSettings";
export const AI_SETTINGS_VERSION = 2;
export const AI_REMOTE_CONSENT_VERSION = 1;

export const AI_PROVIDERS = ["openai", "gemini", "claude"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const DEFAULT_MODELS: Record<AiProvider, string> = {
  openai: "gpt-4.1-mini",
  gemini: "gemini-3.5-flash-lite",
  claude: "claude-3-5-haiku-latest",
};

export const PROVIDER_ORIGINS: Record<AiProvider, string> = {
  openai: "https://api.openai.com/*",
  gemini: "https://generativelanguage.googleapis.com/*",
  claude: "https://api.anthropic.com/*",
};

export interface AiCredentials {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AiSettingsUnconfigured extends Partial<AiCredentials> {
  version: typeof AI_SETTINGS_VERSION;
  state: "unconfigured";
}

export interface AiSettingsRemote extends AiCredentials {
  version: typeof AI_SETTINGS_VERSION;
  state: "remote";
  consentVersion: typeof AI_REMOTE_CONSENT_VERSION;
}

export type AiSettings = AiSettingsUnconfigured | AiSettingsRemote;

export interface AiSettingsStatus {
  healthy: boolean;
  configured: boolean;
}

export interface StorageReaderLike {
  get(key: string): Promise<Record<string, unknown>>;
}

export interface StorageAreaLike extends StorageReaderLike {
  set(items: Record<string, unknown>): Promise<unknown>;
  remove?(key: string): Promise<unknown>;
}

export interface PermissionsApiLike {
  request(permissions: { origins: string[] }): Promise<boolean>;
  remove(permissions: { origins: string[] }): Promise<boolean>;
}

export function defaultModelForProvider(provider: string): string {
  return isAiProvider(provider) ? DEFAULT_MODELS[provider] : "";
}

export function validateAiSettings(value: unknown): AiSettings {
  if (!isRecord(value)) {
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
      ...validateCredentials(value),
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
      ...validateCredentials(value),
      consentVersion: AI_REMOTE_CONSENT_VERSION,
    };
  }

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

export function validateRemoteAiSettings(value: unknown): AiSettingsRemote {
  const settings = validateAiSettings(value);
  if (settings.state !== "remote") {
    throw new Error("Open Dehype and save your AI provider, model, and API key.");
  }
  return settings;
}

export async function loadAiSettings(
  storageArea: StorageAreaLike,
): Promise<AiSettings> {
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

export async function saveAiSettings(
  storageArea: StorageAreaLike,
  value: unknown,
): Promise<AiSettings> {
  const settings = validateAiSettings(value);
  await storageArea.set({ [AI_SETTINGS_KEY]: settings });
  return settings;
}

export async function getAiSettingsStatus(
  storageArea: StorageAreaLike,
): Promise<AiSettingsStatus> {
  try {
    const settings = await loadAiSettings(storageArea);
    const configured = settings.state === "remote";
    return { healthy: configured, configured };
  } catch {
    return { healthy: false, configured: false };
  }
}

export async function requestProviderPermission(
  permissionsApi: Pick<PermissionsApiLike, "request">,
  provider: string,
): Promise<boolean> {
  if (!isAiProvider(provider)) {
    throw new Error("Choose ChatGPT, Gemini, or Claude.");
  }
  return permissionsApi.request({ origins: [PROVIDER_ORIGINS[provider]] });
}

export async function revokeUnusedProviderPermissions(
  permissionsApi: Pick<PermissionsApiLike, "remove">,
  activeProvider: string | null = null,
): Promise<void> {
  const retainedOrigin = isAiProvider(activeProvider ?? "")
    ? PROVIDER_ORIGINS[activeProvider as AiProvider]
    : null;
  const origins = Object.values(PROVIDER_ORIGINS).filter(
    (origin) => origin !== retainedOrigin,
  );
  if (origins.length > 0) await permissionsApi.remove({ origins });
}

function validateCredentials(value: Record<string, unknown>): AiCredentials {
  const provider =
    typeof value.provider === "string" ? value.provider.trim() : "";
  const model = typeof value.model === "string" ? value.model.trim() : "";
  const apiKey = typeof value.apiKey === "string" ? value.apiKey.trim() : "";

  if (!isAiProvider(provider)) {
    throw new Error("Choose ChatGPT, Gemini, or Claude.");
  }
  if (!model) throw new Error("Enter a model name.");
  if (!apiKey) throw new Error("Enter an API key.");
  return { provider, model, apiKey };
}

function copyOptionalCredentials<T extends AiSettingsUnconfigured>(
  value: Record<string, unknown>,
  base: T,
): T {
  try {
    return { ...base, ...validateCredentials(value) };
  } catch {
    return base;
  }
}

function isAiProvider(value: string): value is AiProvider {
  return (AI_PROVIDERS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
