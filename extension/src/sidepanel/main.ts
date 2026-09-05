import {
  emptyUserNeed,
  loadUserNeed,
  parseUserNeedForm,
  resetUserNeed,
  saveUserNeed,
  type UserNeed,
  type UserNeedFormValues,
} from "./userNeed.js";
import {
  clearNeedMatchAnalysis,
  loadNeedMatchAnalysis,
  NEED_MATCH_STORAGE_KEY,
  validateNeedMatchAnalysisState,
  type NeedMatchAnalysisState,
  type NeedMatchItem,
  type NeedMatchStatus,
} from "../shared/needMatch.js";

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
const modeLabel = requiredElement<HTMLElement>("#mode-label");
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

let hasSavedValue = false;
let isEditing = true;
let needMatchViewRevision = 0;

form.addEventListener("input", () => {
  if (!isEditing) {
    return;
  }

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
  void clearNeedMatchAnalysis(chrome.storage.local).catch((error) => {
    setStatus(errorMessage(error), "error");
  });
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

void initialize();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !(NEED_MATCH_STORAGE_KEY in changes)) {
    return;
  }

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

async function initialize(): Promise<void> {
  void initializeNeedMatchAnalysis();

  try {
    const stored = await loadUserNeed(chrome.storage.local);
    const userNeed = stored ?? emptyUserNeed();
    hasSavedValue = stored !== null;
    populateForm(userNeed);
    renderSummary(userNeed);
    setEditing(!hasSavedValue);
    setStatus(
      hasSavedValue ? "Saved user needs loaded." : "Enter your user needs.",
      hasSavedValue ? "success" : "neutral",
    );
  } catch (error) {
    populateForm(emptyUserNeed());
    renderSummary(emptyUserNeed());
    setEditing(true);
    setStatus(errorMessage(error), "error");
  }
}

async function initializeNeedMatchAnalysis(): Promise<void> {
  const revision = needMatchViewRevision;

  try {
    const analysis = await loadNeedMatchAnalysis(chrome.storage.local);

    if (analysis && revision === needMatchViewRevision) {
      renderNeedMatchAnalysis(analysis);
    }
  } catch (error) {
    if (revision === needMatchViewRevision) {
      renderNeedMatchError(errorMessage(error));
    }
  }
}

function readForm(): UserNeed {
  const values: UserNeedFormValues = {
    minBudget: minBudgetInput.value,
    maxBudget: maxBudgetInput.value,
    mustHave: mustHaveInput.value,
    niceToHave: niceToHaveInput.value,
    exclude: excludeInput.value,
  };

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
    const emptyItem = document.createElement("li");
    emptyItem.className = "empty-value";
    emptyItem.textContent = "Not set";
    target.append(emptyItem);
    return;
  }

  for (const item of items) {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    target.append(listItem);
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
  appendAssessmentRows(
    "Budget",
    result.budget ? [{ requirement: "Budget", ...result.budget }] : [],
  );
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

  if (items.length === 0) {
    list.append(createAssessmentRow(title, "unknown"));
  } else {
    for (const item of items) {
      list.append(createAssessmentRow(item.requirement, item.status));
    }
  }

  needMatchDetails.append(list);
}

function createAssessmentRow(
  label: string,
  matchStatus: NeedMatchStatus,
): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "assessment-row";
  item.dataset.matchStatus = matchStatus;
  const icon = document.createElement("span");
  icon.className = "assessment-icon";
  icon.textContent = statusIcon(matchStatus);
  icon.dataset.matchStatus = matchStatus;
  icon.setAttribute("aria-hidden", "true");
  const labelElement = document.createElement("span");
  labelElement.className = "assessment-label";
  labelElement.textContent = label;
  item.setAttribute("aria-label", `${label}: ${matchStatus}`);
  item.append(icon, labelElement);
  return item;
}

function setMatchStatus(element: HTMLElement, matchStatus: NeedMatchStatus): void {
  element.textContent = matchStatus;
  element.dataset.matchStatus = matchStatus;
}

function statusIcon(matchStatus: NeedMatchStatus): string {
  if (matchStatus === "matched") return "✓";
  if (matchStatus === "mismatched") return "✕";
  return "?";
}

function compactProductName(productName: string): string {
  const compacted = productName
    .replace(/\b2D\s+Flat\s+Printing\b/gi, " ")
    .replace(/\b2D\s+Flat\b/gi, " ")
    .replace(/\bWomen's\b/gi, " ")
    .replace(/\bLadies\b/gi, " ")
    .replace(/\bElegant\s+Comfortable\b/gi, " ")
    .replace(/\bDoll\s+Shirt\b/gi, " ")
    .replace(/\bChic\b/gi, " ")
    .replace(/\bTop\s+Fun\b/gi, " ")
    .replace(/\bPattern\s+Design\b/gi, " ")
    .replace(/\bMulticolor\s+Casual\s+Party\s+Travel\s+Birthday\b/gi, " ")
    .replace(/\b(3\/4\s+Sleeve)\s+\1\b/gi, "$1")
    .replace(/[,\s]+/g, " ")
    .trim();
  const words = (compacted || productName).split(/\s+/).filter(Boolean);

  return words.slice(0, 7).join(" ");
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
  modeLabel.textContent = editing ? "Editing" : "Saved";
  summaryState.textContent = "Saved";
}

function setBusy(busy: boolean): void {
  saveButton.disabled = busy || !isEditing;
  editButton.disabled = busy || isEditing || !hasSavedValue;
  resetButton.disabled = busy;
}

function setStatus(message: string, state: "neutral" | "success" | "error"): void {
  status.textContent = message;
  status.dataset.state = state;
}

function budgetInputValue(value: number | null): string {
  return value === null ? "" : String(value);
}

function budgetSummaryValue(value: number | null): string {
  return value === null ? "Not set" : String(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function requiredElement<ElementType extends Element>(selector: string): ElementType {
  const element = document.querySelector<ElementType>(selector);

  if (!element) {
    throw new Error(`Side Panel element not found: ${selector}`);
  }

  return element;
}
