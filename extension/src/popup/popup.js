import {
  defaultModelForProvider,
  loadAiSettings,
  saveAiSettings,
} from "../shared/aiSettings.js";
import {
  productInfoValues,
  sendMessageToActiveTab,
} from "./popupActions.js";

const closeButton = document.querySelector("#close-btn");
const settingsForm = document.querySelector("#settings-form");
const providerInput = document.querySelector("#provider");
const modelInput = document.querySelector("#model");
const apiKeyInput = document.querySelector("#api-key");
const saveButton = document.querySelector("#save-btn");
const neutralizeButton = document.querySelector("#neutralize-btn");
const restoreButton = document.querySelector("#restore-btn");
const modelResult = document.querySelector("#model-result");
const modelOutput = document.querySelector("#model-output");
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
    setStatus("AI settings saved locally.", "success");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

neutralizeButton.addEventListener("click", async () => {
  setButtonsDisabled(true);
  setStatus("Analyzing this product...", "neutral");

  try {
    await saveCurrentSettings();
    const response = await sendMessageToActiveTab(chrome.tabs, {
      type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
    });

    if (!response.ok) {
      throw new Error(response.error ?? "The product could not be analyzed.");
    }

    modelOutput.textContent = JSON.stringify(
      productInfoValues(response.productInfo),
      null,
      2,
    );
    modelResult.hidden = false;
    setStatus("Product text was neutralized.", "success");
  } catch (error) {
    modelResult.hidden = true;
    setStatus(errorMessage(error), "error");
  } finally {
    setButtonsDisabled(false);
  }
});

restoreButton.addEventListener("click", async () => {
  setButtonsDisabled(true);
  setStatus("Restoring the original text...", "neutral");

  try {
    const response = await sendMessageToActiveTab(chrome.tabs, {
      type: "DEHYPE_RESTORE_CURRENT_PRODUCT",
    });

    if (!response.ok) {
      throw new Error(response.error ?? "The page could not be restored.");
    }

    modelResult.hidden = true;
    setStatus("Original product text restored.", "success");
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

    if (!settings) {
      setStatus("Enter and save your AI settings.", "neutral");
      return;
    }

    providerInput.value = settings.provider;
    previousProvider = settings.provider;
    modelInput.value = settings.model;
    apiKeyInput.value = settings.apiKey;
    setStatus("AI settings loaded.", "success");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

async function saveCurrentSettings() {
  return saveAiSettings(chrome.storage.local, {
    provider: providerInput.value,
    model: modelInput.value,
    apiKey: apiKeyInput.value,
  });
}

function setButtonsDisabled(disabled) {
  saveButton.disabled = disabled;
  neutralizeButton.disabled = disabled;
  restoreButton.disabled = disabled;
}

function setStatus(message, state) {
  statusText.textContent = message;
  statusIndicator.className = `status-${state}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
