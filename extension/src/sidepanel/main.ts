import {
  emptyUserNeed,
  loadUserNeed,
  parseUserNeedForm,
  resetUserNeed,
  saveUserNeed,
  type UserNeed,
  type UserNeedFormValues,
} from "./userNeed.js";

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

let hasSavedValue = false;
let isEditing = true;

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
  setEditing(true);
  minBudgetInput.focus();
  setStatus("Editing user needs.", "neutral");
});

resetButton.addEventListener("click", async () => {
  setBusy(true);

  try {
    await resetUserNeed(chrome.storage.local);
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

async function initialize(): Promise<void> {
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
