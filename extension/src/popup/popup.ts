import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_VERSION,
  defaultModelForProvider,
  loadAiSettings,
  requestProviderPermission,
  revokeUnusedProviderPermissions,
  saveAiSettings,
  type AiSettings,
} from "../shared/aiSettings.js";
import { sendMessageToActiveTab } from "./popupActions.js";

type StatusState = "neutral" | "success" | "error";

const closeButton = queryElement<HTMLButtonElement>("#close-btn");
const settingsForm = queryElement<HTMLFormElement>("#settings-form");
const providerInput = queryElement<HTMLSelectElement>("#provider");
const modelInput = queryElement<HTMLInputElement>("#model");
const apiKeyInput = queryElement<HTMLInputElement>("#api-key");
const consentInput = queryElement<HTMLInputElement>("#remote-consent");
const saveButton = queryElement<HTMLButtonElement>("#save-btn");
const neutralizeButton = queryElement<HTMLButtonElement>("#neutralize-btn");
const restoreButton = queryElement<HTMLButtonElement>("#restore-btn");
const statusRow = queryElement<HTMLElement>("#status-row");
const statusIndicator = queryElement<HTMLElement>("#status-indicator");
const statusText = queryElement<HTMLElement>("#status-text");
const compareButton = queryElement<HTMLButtonElement>("#compare-btn");

let previousProvider = providerInput.value;

closeButton.addEventListener("click", () => window.close());
providerInput.addEventListener("change", () => {
  const previousDefault = defaultModelForProvider(previousProvider);
  if (!modelInput.value.trim() || modelInput.value === previousDefault) {
    modelInput.value = defaultModelForProvider(providerInput.value);
  }
  previousProvider = providerInput.value;
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonsDisabled(true);
  try {
    await saveCurrentSettings();
    clearStatus();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

neutralizeButton.addEventListener("click", async () => {
  setButtonsDisabled(true);
  clearStatus();

  try {
    await saveCurrentSettings({ allowStructuralFallback: true });
    await sendMessageToActiveTab(
      chrome.tabs,
      chrome.scripting,
      { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" },
    );
    clearStatus();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

restoreButton.addEventListener("click", async () => {
  setButtonsDisabled(true);
  clearStatus();
  try {
    await sendMessageToActiveTab(
      chrome.tabs,
      chrome.scripting,
      { type: "DEHYPE_RESTORE_CURRENT_PRODUCT" },
    );
    clearStatus();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

compareButton.addEventListener("click", async () => {
  setButtonsDisabled(true);
  clearStatus();
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof activeTab?.windowId !== "number") throw new Error("Open a Temu product page and try again.");
    await chrome.sidePanel.open({ windowId: activeTab.windowId });
    window.close();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

void loadSavedSettings();

async function loadSavedSettings(): Promise<void> {
  if (!globalThis.chrome?.storage?.local) {
    setStatus("Open this popup from the installed Chrome extension.", "neutral");
    return;
  }

  try {
    const settings = await loadAiSettings(chrome.storage.local);
    if (settings.provider) {
      providerInput.value = settings.provider;
      previousProvider = settings.provider;
    }
    if (settings.model) modelInput.value = settings.model;
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    consentInput.checked =
      settings.state === "remote" &&
      settings.consentVersion === AI_REMOTE_CONSENT_VERSION;
    clearStatus();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function saveCurrentSettings({
  allowStructuralFallback = false,
}: { allowStructuralFallback?: boolean } = {}): Promise<AiSettings> {
  const value = {
    version: AI_SETTINGS_VERSION,
    state: "remote",
    provider: providerInput.value,
    model: modelInput.value,
    apiKey: apiKeyInput.value,
  };

  const hasCredentials =
    modelInput.value.trim().length > 0 && apiKeyInput.value.trim().length > 0;
  if (!consentInput.checked || !hasCredentials) {
    if (allowStructuralFallback) {
      await revokeUnusedProviderPermissions(chrome.permissions);
      return saveAiSettings(chrome.storage.local, {
        version: AI_SETTINGS_VERSION,
        state: "unconfigured",
        provider: providerInput.value,
        model: modelInput.value,
        apiKey: apiKeyInput.value,
      });
    }
    throw new Error("Confirm consent before enabling AI analysis.");
  }

  const granted = await requestProviderPermission(
    chrome.permissions,
    providerInput.value,
  );
  if (!granted) {
    if (allowStructuralFallback) {
      return saveAiSettings(chrome.storage.local, {
        version: AI_SETTINGS_VERSION,
        state: "unconfigured",
        provider: providerInput.value,
        model: modelInput.value,
        apiKey: apiKeyInput.value,
      });
    }
    throw new Error(
      "Provider access was not granted. Structural cleanup remains available.",
    );
  }

  await revokeUnusedProviderPermissions(chrome.permissions, providerInput.value);
  return saveAiSettings(chrome.storage.local, {
    ...value,
    consentVersion: AI_REMOTE_CONSENT_VERSION,
  });
}

function setButtonsDisabled(disabled: boolean): void {
  saveButton.disabled = disabled;
  neutralizeButton.disabled = disabled;
  restoreButton.disabled = disabled;
  compareButton.disabled = disabled;
}

function setStatus(message: string, state: StatusState): void {
  statusRow.hidden = false;
  statusText.textContent = message;
  statusIndicator.className = `status-${state}`;
}

function clearStatus(): void {
  statusText.textContent = "";
  statusRow.hidden = true;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function queryElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Missing popup element: ${selector}`);
  return element;
}
