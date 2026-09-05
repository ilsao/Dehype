import {
  AI_REMOTE_CONSENT_VERSION,
  AI_SETTINGS_VERSION,
  defaultModelForProvider,
  loadAiSettings,
  requestProviderPermission,
  revokeUnusedProviderPermissions,
  saveAiSettings,
} from "../shared/aiSettings.js";
import { sendMessageToActiveTab } from "./popupActions.js";

const closeButton = document.querySelector("#close-btn");
const settingsForm = document.querySelector("#settings-form");
const providerInput = document.querySelector("#provider");
const modelInput = document.querySelector("#model");
const apiKeyInput = document.querySelector("#api-key");
const consentInput = document.querySelector("#remote-consent");
const saveButton = document.querySelector("#save-btn");
const neutralizeButton = document.querySelector("#neutralize-btn");
const restoreButton = document.querySelector("#restore-btn");
const statusRow = document.querySelector("#status-row");
const statusIndicator = document.querySelector("#status-indicator");
const statusText = document.querySelector("#status-text");

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
      { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" },
      chrome.scripting,
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
      { type: "DEHYPE_RESTORE_CURRENT_PRODUCT" },
      chrome.scripting,
    );
    clearStatus();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

void loadSavedSettings();

async function loadSavedSettings() {
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

async function saveCurrentSettings({ allowStructuralFallback = false } = {}) {
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
    throw new Error("Provider access was not granted. Structural cleanup remains available.");
  }
  await revokeUnusedProviderPermissions(chrome.permissions, providerInput.value);
  value.consentVersion = AI_REMOTE_CONSENT_VERSION;

  return saveAiSettings(chrome.storage.local, value);
}

function setButtonsDisabled(disabled) {
  saveButton.disabled = disabled;
  neutralizeButton.disabled = disabled;
  restoreButton.disabled = disabled;
}

function setStatus(message, state) {
  statusRow.hidden = false;
  statusText.textContent = message;
  statusIndicator.className = `status-${state}`;
}

function clearStatus() {
  statusText.textContent = "";
  statusRow.hidden = true;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
