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
const modeInput = document.querySelector("#analysis-mode");
const remoteSettings = document.querySelector("#remote-settings");
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
modeInput.addEventListener("change", updateModeVisibility);
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
    await saveCurrentSettings();
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
    modeInput.value = settings.mode;
    if (settings.provider) {
      providerInput.value = settings.provider;
      previousProvider = settings.provider;
    }
    if (settings.model) modelInput.value = settings.model;
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    consentInput.checked =
      settings.mode === "remote" &&
      settings.consentVersion === AI_REMOTE_CONSENT_VERSION;
    updateModeVisibility();
    clearStatus();
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function saveCurrentSettings() {
  const remote = modeInput.value === "remote";
  const value = {
    version: AI_SETTINGS_VERSION,
    mode: remote ? "remote" : "local",
    provider: providerInput.value,
    model: modelInput.value,
    apiKey: apiKeyInput.value,
  };

  if (remote) {
    if (!consentInput.checked) {
      throw new Error("Confirm consent before enabling AI analysis.");
    }
    const granted = await requestProviderPermission(
      chrome.permissions,
      providerInput.value,
    );
    if (!granted) {
      throw new Error("Provider access was not granted. On-device mode is unchanged.");
    }
    await revokeUnusedProviderPermissions(chrome.permissions, providerInput.value);
    value.consentVersion = AI_REMOTE_CONSENT_VERSION;
  } else {
    await revokeUnusedProviderPermissions(chrome.permissions);
  }

  return saveAiSettings(chrome.storage.local, value);
}

function updateModeVisibility() {
  const remote = modeInput.value === "remote";
  remoteSettings.hidden = !remote;
  for (const input of remoteSettings.querySelectorAll("input, select")) {
    input.disabled = !remote;
  }
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
