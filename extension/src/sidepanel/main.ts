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
import {
  clearNeedMatchAnalysis,
  loadNeedMatchAnalysis,
  NEED_MATCH_STORAGE_KEY,
  validateNeedMatchAnalysisState,
  type NeedMatchAnalysisState,
  type NeedMatchItem,
  type NeedMatchStatus,
} from "../shared/needMatch.js";
import {
  createPriceBins,
  isBinInBudget,
  type PriceBin,
} from "../shared/priceComparison.js";
import type {
  GetPageStateResponse,
  PriceComparisonResult,
} from "../shared/productInfo.js";
import { sendMessageToActiveTab } from "../shared/tabActions.js";
import {
  emptyUserNeed,
  loadUserNeed,
  parseUserNeedForm,
  resetUserNeed,
  saveUserNeed,
  type UserNeed,
  type UserNeedFormValues,
} from "./userNeed.js";

type ViewName = "home" | "needs" | "prices" | "settings";
type StatusState = "neutral" | "success" | "error";

const form = requiredElement<HTMLFormElement>("#user-need-form");
const fields = requiredElement<HTMLFieldSetElement>("#user-need-fields");
const minBudgetInput = requiredElement<HTMLInputElement>("#min-budget");
const maxBudgetInput = requiredElement<HTMLInputElement>("#max-budget");
const mustHaveInput = requiredElement<HTMLTextAreaElement>("#must-have");
const niceToHaveInput = requiredElement<HTMLTextAreaElement>("#nice-to-have");
const excludeInput = requiredElement<HTMLTextAreaElement>("#exclude");
const saveButton = requiredElement<HTMLButtonElement>("#save-button");
const editButton = requiredElement<HTMLButtonElement>("#edit-button");
const resetButton = requiredElement<HTMLButtonElement>("#reset-button");
const comparePricesButton = requiredElement<HTMLButtonElement>("#compare-prices-button");
const refreshPricesButton = requiredElement<HTMLButtonElement>("#refresh-prices-button");
const summarySection = requiredElement<HTMLElement>("#summary-section");
const summaryState = requiredElement<HTMLElement>("#summary-state");
const summaryMinBudget = requiredElement<HTMLElement>("#summary-min-budget");
const summaryMaxBudget = requiredElement<HTMLElement>("#summary-max-budget");
const summaryMustHave = requiredElement<HTMLUListElement>("#summary-must-have");
const summaryNiceToHave = requiredElement<HTMLUListElement>("#summary-nice-to-have");
const summaryExclude = requiredElement<HTMLUListElement>("#summary-exclude");
const status = requiredElement<HTMLElement>("#status");
const needMatchSection = requiredElement<HTMLElement>("#need-match-section");
const needMatchStatus = requiredElement<HTMLElement>("#need-match-status");
const needMatchProduct = requiredElement<HTMLElement>("#need-match-product");
const needMatchExplanation = requiredElement<HTMLElement>("#need-match-explanation");
const needMatchDetails = requiredElement<HTMLElement>("#need-match-details");
const priceStatus = requiredElement<HTMLElement>("#price-status");
const priceChart = requiredElement<HTMLElement>("#price-chart");
const priceBudgetLabel = requiredElement<HTMLElement>("#price-budget-label");
const neutralizeCard = requiredElement<HTMLElement>("#neutralize-card");
const neutralizeButton = requiredElement<HTMLButtonElement>("#neutralize-button");
const neutralizeState = requiredElement<HTMLElement>("#neutralize-state");
const neutralizeHeading = requiredElement<HTMLElement>("#neutralize-heading");
const neutralizeDescription = requiredElement<HTMLElement>("#neutralize-description");
const settingsForm = requiredElement<HTMLFormElement>("#settings-form");
const providerInput = requiredElement<HTMLSelectElement>("#provider");
const modelInput = requiredElement<HTMLInputElement>("#model");
const apiKeyInput = requiredElement<HTMLInputElement>("#api-key");
const consentInput = requiredElement<HTMLInputElement>("#remote-consent");
const saveSettingsButton = requiredElement<HTMLButtonElement>("#save-settings-button");
const settingsSummary = requiredElement<HTMLElement>("#settings-summary");
const aiSetupNotice = requiredElement<HTMLButtonElement>("#ai-setup-notice");
const settingsLink = requiredElement<HTMLButtonElement>("#settings-link");

let hasSavedValue = false;
let isEditing = true;
let needMatchViewRevision = 0;
let priceComparisonRevision = 0;
let currentView: ViewName = "home";
let isNeutralized = false;
let previousProvider = providerInput.value;

for (const target of document.querySelectorAll<HTMLElement>("[data-view-target]")) {
  target.addEventListener("click", () => {
    const view = target.dataset.viewTarget;
    if (isViewName(view)) showView(view);
  });
}

comparePricesButton.addEventListener("click", () => void requestPriceComparison());
refreshPricesButton.addEventListener("click", () => void requestPriceComparison());
neutralizeButton.addEventListener("click", () => void toggleNeutralize());
providerInput.addEventListener("change", updateProviderDefault);
settingsForm.addEventListener("submit", (event) => void submitSettings(event));

form.addEventListener("input", () => {
  if (!isEditing) return;
  try {
    readForm();
    setStatus("Editing user needs.", "neutral");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy(true);
  try {
    const userNeed = await saveUserNeed(chrome.storage.local, readForm());
    hasSavedValue = true;
    populateForm(userNeed);
    renderSummary(userNeed);
    setEditing(false);
    setStatus("User needs saved in this browser.", "success");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setBusy(false);
  }
});

editButton.addEventListener("click", () => {
  hideNeedMatchAnalysis();
  void clearNeedMatchAnalysis(chrome.storage.local).catch((error) =>
    setStatus(errorMessage(error), "error"),
  );
  setEditing(true);
  minBudgetInput.focus();
  setStatus("Editing user needs.", "neutral");
});

resetButton.addEventListener("click", async () => {
  hideNeedMatchAnalysis();
  setBusy(true);
  try {
    await Promise.all([
      resetUserNeed(chrome.storage.local),
      clearNeedMatchAnalysis(chrome.storage.local),
    ]);
    const empty = emptyUserNeed();
    hasSavedValue = false;
    populateForm(empty);
    renderSummary(empty);
    setEditing(true);
    setStatus("User needs reset.", "success");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setBusy(false);
  }
});

if (globalThis.chrome?.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isPriceComparisonResult(message) && currentView === "prices") {
      renderPriceComparison(message);
    } else if (isPriceComparisonError(message) && currentView === "prices") {
      priceStatus.textContent = message.message;
    }
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !(NEED_MATCH_STORAGE_KEY in changes)) return;
  const value = changes[NEED_MATCH_STORAGE_KEY]?.newValue;
  needMatchViewRevision += 1;
  if (value === undefined) {
    hideNeedMatchAnalysis();
    return;
  }
  try {
    renderNeedMatchAnalysis(validateNeedMatchAnalysisState(value));
  } catch (error) {
    renderNeedMatchError(errorMessage(error));
  }
});

chrome.tabs.onActivated?.addListener(() => void initializePageState());
chrome.tabs.onUpdated?.addListener((_tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.status === "complete" || changeInfo.url)) {
    void initializePageState();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void initializePageState();
});

void initialize();

async function initialize(): Promise<void> {
  void initializeNeedMatchAnalysis();
  await Promise.all([
    initializeUserNeed(),
    initializeSettings(),
    initializePageState(),
  ]);
  showView(initialView());
  setStatus("Dehype is ready.", "neutral");
}

async function initializeUserNeed(): Promise<void> {
  try {
    const stored = await loadUserNeed(chrome.storage.local);
    const userNeed = stored ?? emptyUserNeed();
    hasSavedValue = stored !== null;
    populateForm(userNeed);
    renderSummary(userNeed);
    setEditing(!hasSavedValue);
  } catch (error) {
    populateForm(emptyUserNeed());
    renderSummary(emptyUserNeed());
    setEditing(true);
    setStatus(errorMessage(error), "error");
  }
}

async function initializeSettings(): Promise<void> {
  try {
    const settings = await loadAiSettings(chrome.storage.local);
    if (settings.provider) {
      providerInput.value = settings.provider;
      previousProvider = settings.provider;
    }
    if (settings.model) modelInput.value = settings.model;
    if (settings.apiKey) apiKeyInput.value = settings.apiKey;
    consentInput.checked = settings.state === "remote" && settings.consentVersion === AI_REMOTE_CONSENT_VERSION;
    renderSettingsSummary(settings);
  } catch (error) {
    setStatus(errorMessage(error), "error");
  }
}

function showView(view: ViewName): void {
  const leavingPrices = currentView === "prices" && view !== "prices";
  currentView = view;
  for (const element of document.querySelectorAll<HTMLElement>("[data-view]")) {
    element.hidden = element.dataset.view !== view;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  if (leavingPrices) void exitPriceComparison();
}

async function initializePageState(): Promise<void> {
  setProductAvailability("checking");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number") {
      setProductAvailability("unsupported");
      return;
    }
    try {
      const response: unknown = await chrome.tabs.sendMessage(tab.id, {
        type: "DEHYPE_GET_PAGE_STATE",
      });
      if (isPageStateResponse(response)) {
        if (!response.supportedProduct) setProductAvailability("unsupported");
        else {
          setProductAvailability("supported");
          setNeutralized(response.neutralized);
        }
        return;
      }
    } catch {
      // A supported tab opened before the latest extension reload can be
      // neutralized after the action injects the current content script.
    }
    setProductAvailability(
      typeof tab.url === "string" && isSupportedTemuProductUrl(tab.url)
        ? "supported"
        : "unsupported",
    );
  } catch {
    setProductAvailability("unsupported");
  }
}

function setProductAvailability(
  availability: "checking" | "supported" | "unsupported",
): void {
  neutralizeButton.hidden = availability !== "supported";
  if (availability === "checking") {
    neutralizeState.textContent = "Checking";
    neutralizeHeading.textContent = "Checking the current page";
    neutralizeDescription.textContent = "Dehype is looking for a supported product page.";
  } else if (availability === "unsupported") {
    isNeutralized = false;
    neutralizeCard.dataset.state = "unavailable";
    neutralizeState.textContent = "Unavailable";
    neutralizeHeading.textContent = "Open a supported product";
    neutralizeDescription.textContent = "Neutralize appears on supported Temu product pages.";
  } else {
    setNeutralized(isNeutralized);
  }
}

async function toggleNeutralize(): Promise<void> {
  setBusy(true);
  setStatus(isNeutralized ? "Restoring the original page..." : "Neutralizing the current page...", "neutral");
  try {
    if (isNeutralized) {
      await sendMessageToActiveTab(chrome.tabs, chrome.scripting, { type: "DEHYPE_RESTORE_CURRENT_PRODUCT" });
      setNeutralized(false);
      setStatus("Original product page restored.", "success");
    } else {
      await saveCurrentSettings({ allowStructuralFallback: true });
      await sendMessageToActiveTab(chrome.tabs, chrome.scripting, { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" });
      setNeutralized(true);
      setStatus("Promotional pressure reduced on this page.", "success");
    }
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

function setNeutralized(neutralized: boolean): void {
  isNeutralized = neutralized;
  neutralizeCard.dataset.state = neutralized ? "neutralized" : "ready";
  neutralizeState.textContent = neutralized ? "Neutralized ✓" : "Ready";
  neutralizeHeading.textContent = neutralized ? "Pressure reduced. Facts remain." : "Quiet this product page";
  neutralizeDescription.textContent = neutralized ? "Continue comparing, or restore the original page at any time." : "Remove urgency and promotional pressure without hiding the product itself.";
  neutralizeButton.textContent = neutralized ? "Restore original page" : "Neutralize this page";
}

function updateProviderDefault(): void {
  const previousDefault = defaultModelForProvider(previousProvider);
  if (!modelInput.value.trim() || modelInput.value === previousDefault) {
    modelInput.value = defaultModelForProvider(providerInput.value);
  }
  previousProvider = providerInput.value;
}

async function submitSettings(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  setBusy(true);
  try {
    const settings = await saveCurrentSettings();
    renderSettingsSummary(settings);
    setStatus("AI settings saved in this browser.", "success");
    showView("home");
  } catch (error) {
    setStatus(errorMessage(error), "error");
  } finally {
    setBusy(false);
  }
}

async function saveCurrentSettings({ allowStructuralFallback = false }: { allowStructuralFallback?: boolean } = {}): Promise<AiSettings> {
  const base = { version: AI_SETTINGS_VERSION, state: "remote" as const, provider: providerInput.value, model: modelInput.value, apiKey: apiKeyInput.value };
  const hasCredentials = modelInput.value.trim().length > 0 && apiKeyInput.value.trim().length > 0;
  if (!consentInput.checked || !hasCredentials) {
    if (!allowStructuralFallback) throw new Error("Confirm consent before enabling AI analysis.");
    await revokeUnusedProviderPermissions(chrome.permissions);
    return saveAiSettings(chrome.storage.local, { ...base, state: "unconfigured" });
  }
  const granted = await requestProviderPermission(chrome.permissions, providerInput.value);
  if (!granted) {
    if (!allowStructuralFallback) throw new Error("Provider access was not granted. Structural cleanup remains available.");
    return saveAiSettings(chrome.storage.local, { ...base, state: "unconfigured" });
  }
  await revokeUnusedProviderPermissions(chrome.permissions, providerInput.value);
  return saveAiSettings(chrome.storage.local, { ...base, consentVersion: AI_REMOTE_CONSENT_VERSION });
}

function renderSettingsSummary(settings: AiSettings): void {
  aiSetupNotice.hidden = settings.state === "remote";
  settingsLink.hidden = settings.state !== "remote";
  settingsSummary.textContent = settings.state === "remote" ? `${providerLabel(settings.provider)} · Connected →` : "Not configured →";
}

function providerLabel(provider: string): string {
  return ({ openai: "OpenAI", gemini: "Gemini", claude: "Claude" } as Record<string, string>)[provider] ?? provider;
}

async function initializeNeedMatchAnalysis(): Promise<void> {
  const revision = needMatchViewRevision;
  try {
    const analysis = await loadNeedMatchAnalysis(chrome.storage.local);
    if (analysis && revision === needMatchViewRevision) renderNeedMatchAnalysis(analysis);
  } catch (error) {
    if (revision === needMatchViewRevision) renderNeedMatchError(errorMessage(error));
  }
}

function readForm(): UserNeed {
  const values: UserNeedFormValues = { minBudget: minBudgetInput.value, maxBudget: maxBudgetInput.value, mustHave: mustHaveInput.value, niceToHave: niceToHaveInput.value, exclude: excludeInput.value };
  return parseUserNeedForm(values);
}

function populateForm(userNeed: UserNeed): void {
  minBudgetInput.value = budgetInputValue(userNeed.minBudget);
  maxBudgetInput.value = budgetInputValue(userNeed.maxBudget);
  mustHaveInput.value = userNeed.mustHave.join("\n");
  niceToHaveInput.value = userNeed.niceToHave.join("\n");
  excludeInput.value = userNeed.exclude.join("\n");
}

function renderSummary(userNeed: UserNeed): void {
  summaryMinBudget.textContent = budgetSummaryValue(userNeed.minBudget);
  summaryMaxBudget.textContent = budgetSummaryValue(userNeed.maxBudget);
  renderList(summaryMustHave, userNeed.mustHave);
  renderList(summaryNiceToHave, userNeed.niceToHave);
  renderList(summaryExclude, userNeed.exclude);
}

function renderList(target: HTMLUListElement, items: string[]): void {
  target.replaceChildren();
  if (items.length === 0) {
    const item = document.createElement("li");
    item.className = "empty-value";
    item.textContent = "Not set";
    target.append(item);
    return;
  }
  for (const value of items) {
    const item = document.createElement("li");
    item.textContent = value;
    target.append(item);
  }
}

function renderNeedMatchAnalysis(analysis: NeedMatchAnalysisState): void {
  needMatchSection.hidden = false;
  needMatchDetails.replaceChildren();
  delete needMatchStatus.dataset.matchStatus;
  if (analysis.state === "analyzing") {
    needMatchStatus.textContent = "Analyzing";
    needMatchProduct.textContent = "";
    needMatchExplanation.textContent = "Comparing this product with your saved needs...";
    return;
  }
  if (analysis.state === "error") {
    renderNeedMatchError(analysis.message);
    return;
  }
  const { result } = analysis;
  setMatchStatus(needMatchStatus, result.status);
  needMatchProduct.textContent = compactProductName(result.productName);
  needMatchExplanation.textContent = result.explanation;
  appendAssessmentRows("Budget", result.budget ? [{ requirement: "Budget", ...result.budget }] : []);
  appendAssessmentRows("Must have", result.mustHave);
  appendAssessmentRows("Nice to have", result.niceToHave);
  appendAssessmentRows("Exclude", result.exclude);
}

function renderNeedMatchError(message: string): void {
  needMatchSection.hidden = false;
  needMatchStatus.textContent = "Error";
  needMatchStatus.dataset.matchStatus = "mismatched";
  needMatchProduct.textContent = "";
  needMatchExplanation.textContent = message;
  needMatchDetails.replaceChildren();
}

function hideNeedMatchAnalysis(): void {
  needMatchViewRevision += 1;
  needMatchSection.hidden = true;
  needMatchProduct.textContent = "";
  needMatchExplanation.textContent = "";
  needMatchDetails.replaceChildren();
}

function appendAssessmentRows(title: string, items: NeedMatchItem[]): void {
  const list = document.createElement("ul");
  list.className = "assessment-list";
  if (items.length === 0) list.append(createAssessmentRow(title, "unknown"));
  else for (const item of items) list.append(createAssessmentRow(item.requirement, item.status));
  needMatchDetails.append(list);
}

function createAssessmentRow(label: string, matchStatus: NeedMatchStatus): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "assessment-row";
  item.dataset.matchStatus = matchStatus;
  item.setAttribute("aria-label", `${label}: ${matchStatus}`);
  const icon = document.createElement("span");
  icon.className = "assessment-icon";
  icon.textContent = matchStatus === "matched" ? "✓" : matchStatus === "mismatched" ? "✕" : "?";
  icon.dataset.matchStatus = matchStatus;
  icon.setAttribute("aria-hidden", "true");
  const text = document.createElement("span");
  text.className = "assessment-label";
  text.textContent = label;
  item.append(icon, text);
  return item;
}

function setMatchStatus(element: HTMLElement, matchStatus: NeedMatchStatus): void {
  element.textContent = matchStatus;
  element.dataset.matchStatus = matchStatus;
}

function compactProductName(productName: string): string {
  const compacted = productName.replace(/\b2D\s+Flat\s+Printing\b/gi, " ").replace(/\b2D\s+Flat\b/gi, " ").replace(/\bWomen's\b/gi, " ").replace(/\bLadies\b/gi, " ").replace(/\bElegant\s+Comfortable\b/gi, " ").replace(/\bDoll\s+Shirt\b/gi, " ").replace(/\bChic\b/gi, " ").replace(/\bTop\s+Fun\b/gi, " ").replace(/\bPattern\s+Design\b/gi, " ").replace(/\bMulticolor\s+Casual\s+Party\s+Travel\s+Birthday\b/gi, " ").replace(/\b(3\/4\s+Sleeve)\s+\1\b/gi, "$1").replace(/[,\s]+/g, " ").trim();
  return (compacted || productName).split(/\s+/).filter(Boolean).slice(0, 7).join(" ");
}

function setEditing(editing: boolean): void {
  isEditing = editing;
  fields.hidden = !editing;
  fields.disabled = !editing;
  saveButton.hidden = !editing;
  saveButton.disabled = !editing;
  editButton.hidden = editing || !hasSavedValue;
  editButton.disabled = editing || !hasSavedValue;
  summarySection.hidden = editing || !hasSavedValue;
  summaryState.textContent = "Saved";
}

function setBusy(busy: boolean): void {
  saveButton.disabled = busy || !isEditing;
  editButton.disabled = busy || isEditing || !hasSavedValue;
  resetButton.disabled = busy;
  comparePricesButton.disabled = busy;
  refreshPricesButton.disabled = busy;
  neutralizeButton.disabled = busy;
  saveSettingsButton.disabled = busy;
}

async function requestPriceComparison(): Promise<void> {
  const revision = ++priceComparisonRevision;
  setBusy(true);
  showView("prices");
  priceStatus.textContent = "Comparing prices...";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id !== "number") throw new Error("Open a Temu product page first.");
    const response = await chrome.tabs.sendMessage(tab.id, { type: "DEHYPE_PRICE_COMPARISON" });
    if (revision !== priceComparisonRevision || currentView !== "prices") return;
    if (isPriceComparisonResult(response)) renderPriceComparison(response);
    else if (isPriceComparisonError(response)) priceStatus.textContent = response.message;
    else throw new Error("The price comparison returned an invalid response.");
  } catch (error) {
    if (revision === priceComparisonRevision && currentView === "prices") {
      priceStatus.textContent = errorMessage(error);
    }
  } finally {
    setBusy(false);
  }
}

async function exitPriceComparison(): Promise<void> {
  priceComparisonRevision += 1;
  clearPriceComparisonView();
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (typeof tab?.id === "number") {
      await chrome.tabs.sendMessage(tab.id, { type: "DEHYPE_RETURN_FROM_SEARCH" });
    }
  } catch {
    // There may be no active comparison or the tab may be navigating back.
  } finally {
    window.setTimeout(() => void initializePageState(), 350);
  }
}

function clearPriceComparisonView(): void {
  priceStatus.textContent = "";
  priceBudgetLabel.textContent = "";
  priceChart.replaceChildren();
  requiredElement<HTMLElement>("#price-min").textContent = "—";
  requiredElement<HTMLElement>("#price-median").textContent = "—";
  requiredElement<HTMLElement>("#price-max").textContent = "—";
}

function renderPriceComparison(data: PriceComparisonResult): void {
  showView("prices");
  priceStatus.textContent = "";
  requiredElement<HTMLElement>("#price-min").textContent = formatPrice(data.min, data.products[0]?.currency);
  requiredElement<HTMLElement>("#price-median").textContent = formatPrice(data.median, data.products[0]?.currency);
  requiredElement<HTMLElement>("#price-max").textContent = formatPrice(data.max, data.products[0]?.currency);
  const currency = data.products[0]?.currency ?? "unknown currency";
  const userNeed = readSavedNeedForChart();
  priceBudgetLabel.textContent = budgetLabel(userNeed, currency);
  const bins = createPriceBins(data.products.map(({ price }) => price));
  priceChart.replaceChildren(...createPriceBars(bins, currency, userNeed));
}

function readSavedNeedForChart(): UserNeed {
  return { minBudget: parseBudgetValue(minBudgetInput.value), maxBudget: parseBudgetValue(maxBudgetInput.value), mustHave: [], niceToHave: [], exclude: [] };
}

export function createPriceBars(bins: PriceBin[], currency: string, userNeed?: Pick<UserNeed, "minBudget" | "maxBudget">): HTMLElement[] {
  const maximumCount = Math.max(...bins.map(({ count }) => count), 1);
  return bins.map((bin) => {
    const inBudget = isBinInBudget(bin, userNeed?.minBudget ?? null, userNeed?.maxBudget ?? null);
    const group = document.createElement("div");
    group.className = `price-bar-group${inBudget ? " in-budget" : ""}`;
    const column = document.createElement("div");
    column.className = `price-bar-column${inBudget ? " in-budget" : ""}`;
    if (inBudget) {
      column.title = "Within your budget range";
      column.setAttribute("aria-label", "Within budget range");
    }
    const count = document.createElement("span");
    count.className = "price-bar-count";
    count.textContent = String(bin.count);
    const bar = document.createElement("span");
    bar.className = "price-bar";
    bar.style.height = `${(bin.count / maximumCount) * 100}%`;
    column.append(count, bar);
    const label = document.createElement("span");
    label.className = "price-bar-label";
    label.textContent = `${formatPrice(bin.lower, currency)}-${formatPrice(bin.upper, currency)}`;
    group.append(column, label);
    return group;
  });
}

function budgetLabel(userNeed: UserNeed, currency: string): string {
  if (userNeed.minBudget === null && userNeed.maxBudget === null) return "";
  const minimum = userNeed.minBudget === null ? "no min" : formatPrice(userNeed.minBudget, currency);
  const maximum = userNeed.maxBudget === null ? "no max" : formatPrice(userNeed.maxBudget, currency);
  return `Budget: ${minimum} - ${maximum}`;
}

function parseBudgetValue(value: string): number | null {
  const parsed = Number(value.trim());
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: number, currency = ""): string {
  return `${value.toFixed(2)} ${currency}`.trim();
}

function isPriceComparisonResult(value: unknown): value is PriceComparisonResult {
  return isRecord(value) && value.type === "DEHYPE_PRICE_COMPARISON_RESULT" && (value.source === "api" || value.source === "dom") && Array.isArray(value.products) && typeof value.productName === "string" && typeof value.searchKeyword === "string" && typeof value.min === "number" && typeof value.max === "number" && typeof value.median === "number";
}

function isPriceComparisonError(value: unknown): value is { type: string; message: string } {
  return isRecord(value) && value.type === "DEHYPE_PRICE_COMPARISON_ERROR" && typeof value.message === "string";
}

function isPageStateResponse(value: unknown): value is GetPageStateResponse {
  return isRecord(value) &&
    value.type === "DEHYPE_PAGE_STATE_RESULT" &&
    typeof value.neutralized === "boolean" &&
    typeof value.priceComparisonActive === "boolean" &&
    typeof value.supportedProduct === "boolean";
}

function isSupportedTemuProductUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return /(^|\.)temu\.com$/i.test(url.hostname) && /-g-\d+\.html(?:$|[?#])/i.test(value);
  } catch {
    return false;
  }
}

function isViewName(value: string | undefined): value is ViewName {
  return value === "home" || value === "needs" || value === "prices" || value === "settings";
}

function initialView(): ViewName {
  const requested = window.location.hash.replace(/^#/, "");
  return isViewName(requested) ? requested : "home";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function setStatus(message: string, state: StatusState): void {
  status.textContent = message;
  status.dataset.state = state;
}

function budgetInputValue(value: number | null): string { return value === null ? "" : String(value); }
function budgetSummaryValue(value: number | null): string { return value === null ? "Not set" : String(value); }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }

function requiredElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Side Panel element not found: ${selector}`);
  return element;
}
