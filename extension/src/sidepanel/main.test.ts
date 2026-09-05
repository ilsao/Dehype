import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sidepanelHtml = readFileSync(
  resolve(process.cwd(), "extension/src/sidepanel/index.html"),
  "utf8",
);

describe("Dehype side panel", () => {
  const storedValues: Record<string, unknown> = {};
  let storageChangeListener: (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => void;
  let messageListener: (message: unknown) => void = () => {};
  let pageState = {
    type: "DEHYPE_PAGE_STATE_RESULT",
    neutralized: false,
    priceComparisonActive: false,
    supportedProduct: true,
  };
  const tabsSendMessage = vi.fn(async (_tabId: number, message: { type?: string }) =>
    message.type === "DEHYPE_GET_PAGE_STATE" ? pageState : undefined,
  );
  const storage = {
    get: vi.fn(async () => storedValues),
    set: vi.fn(async (values: Record<string, unknown>) => Object.assign(storedValues, values)),
    remove: vi.fn(async (key: string) => delete storedValues[key]),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of Object.keys(storedValues)) delete storedValues[key];
    pageState = {
      type: "DEHYPE_PAGE_STATE_RESULT",
      neutralized: false,
      priceComparisonActive: false,
      supportedProduct: true,
    };
    window.location.hash = "";
    document.body.innerHTML = sidepanelHtml.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";
    vi.stubGlobal("chrome", {
      storage: {
        local: storage,
        onChanged: { addListener: vi.fn((listener) => { storageChangeListener = listener; }) },
      },
      runtime: {
        onMessage: { addListener: vi.fn((listener) => { messageListener = listener; }) },
      },
      tabs: {
        query: vi.fn(async () => [{
          id: 42,
          active: true,
          url: "https://www.temu.com/product-g-123.html",
        }]),
        sendMessage: tabsSendMessage,
      },
      scripting: { executeScript: vi.fn() },
      permissions: { request: vi.fn(async () => true), remove: vi.fn(async () => true) },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("opens on a focused home with Neutralize as the primary action", async () => {
    await import("./main.js");
    await vi.waitFor(() => expect(element("#status").textContent).toBe("Dehype is ready."));
    expect(element("#home-view").hidden).toBe(false);
    expect(element("#needs-view").hidden).toBe(true);
    expect(button("#neutralize-button").textContent).toBe("Neutralize this page");
    expect(button("#neutralize-button").hidden).toBe(false);
    expect(button("#ai-setup-notice").hidden).toBe(false);
    expect(document.querySelectorAll(".feature-link")).toHaveLength(3);
  });

  it("restores the Neutralize button state from the active product page", async () => {
    pageState.neutralized = true;
    await import("./main.js");
    await vi.waitFor(() =>
      expect(button("#neutralize-button").textContent).toBe("Restore original page"),
    );
    expect(element("#neutralize-state").textContent).toBe("Neutralized ✓");
  });

  it("navigates between home, User Need, and settings without stacking views", async () => {
    await import("./main.js");
    await vi.waitFor(() => expect(element("#status").textContent).toBe("Dehype is ready."));
    button('[data-view-target="needs"]').click();
    expect(element("#home-view").hidden).toBe(true);
    expect(element("#needs-view").hidden).toBe(false);
    expect(element("#settings-view").hidden).toBe(true);
    button('[data-view-target="home"]').click();
    button('[data-view-target="settings"]').click();
    expect(element("#home-view").hidden).toBe(true);
    expect(element("#needs-view").hidden).toBe(true);
    expect(element("#settings-view").hidden).toBe(false);
  });

  it("returns home after AI settings are saved", async () => {
    await import("./main.js");
    await vi.waitFor(() => expect(element("#status").textContent).toBe("Dehype is ready."));
    button('[data-view-target="settings"]').click();
    input("#model").value = "gpt-test";
    input("#api-key").value = "test-key";
    input("#remote-consent").checked = true;

    document.querySelector<HTMLFormElement>("#settings-form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );

    await vi.waitFor(() => {
      expect(element("#status").textContent).toBe("AI settings saved in this browser.");
      expect(element("#home-view").hidden).toBe(false);
      expect(element("#settings-view").hidden).toBe(true);
      expect(button("#ai-setup-notice").hidden).toBe(true);
    });
  });

  it("saves, collapses, edits, and resets user needs", async () => {
    await import("./main.js");
    await vi.waitFor(() => expect(element("#status").textContent).toBe("Dehype is ready."));
    input("#min-budget").value = "100";
    input("#max-budget").value = "500";
    textarea("#must-have").value = "USB-C\nQuiet fan";
    form().dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(element("#summary-section").hidden).toBe(false));
    expect(element("#summary-must-have").textContent).toContain("USB-C");
    expect(fieldset().hidden).toBe(true);
    button("#edit-button").click();
    expect(fieldset().hidden).toBe(false);
    button("#reset-button").click();
    await vi.waitFor(() => {
      expect(storage.remove).toHaveBeenCalledWith("userNeed");
      expect(input("#min-budget").value).toBe("");
    });
  });

  it("loads and updates Need Match Analysis", async () => {
    storedValues.userNeed = { minBudget: null, maxBudget: 500, mustHave: ["USB-C"], niceToHave: [], exclude: [] };
    storedValues.needMatchAnalysis = successAnalysis("first");
    await import("./main.js");
    await vi.waitFor(() => expect(element("#need-match-status").textContent).toBe("matched"));
    expect(element("#need-match-details").textContent).toContain("✓USB-C");
    storageChangeListener(
      { needMatchAnalysis: { oldValue: successAnalysis("first"), newValue: { state: "analyzing", analysisId: "second" } } },
      "local",
    );
    expect(element("#need-match-status").textContent).toBe("Analyzing");
  });

  it("opens price results on their own page and highlights budget bins", async () => {
    storedValues.userNeed = { minBudget: 3, maxBudget: 8, mustHave: [], niceToHave: [], exclude: [] };
    await import("./main.js");
    await vi.waitFor(() => expect(element("#status").textContent).toBe("Dehype is ready."));
    button("#compare-prices-button").click();
    expect(element("#prices-view").hidden).toBe(false);
    messageListener({
      type: "DEHYPE_PRICE_COMPARISON_RESULT",
      source: "dom",
      productName: "Product",
      searchKeyword: "Product",
      min: 2.5,
      max: 15,
      median: 7,
      products: [
        { price: 2.5, currency: "USD", name: "P1" },
        { price: 4.5, currency: "USD", name: "P2" },
        { price: 7, currency: "USD", name: "P3" },
        { price: 10, currency: "USD", name: "P4" },
        { price: 15, currency: "USD", name: "P5" },
      ],
    });
    expect(element("#prices-view").hidden).toBe(false);
    expect(element("#home-view").hidden).toBe(true);
    expect(element("#price-median").textContent).toBe("7.00 USD");
    expect(element("#price-budget-label").textContent).toBe("Budget: 3.00 USD - 8.00 USD");
    expect(document.querySelectorAll(".price-bar-column.in-budget").length).toBeGreaterThan(0);

    button("#return-to-needs").click();
    expect(element("#home-view").hidden).toBe(false);
    expect(element("#price-chart").children).toHaveLength(0);
    expect(element("#price-median").textContent).toBe("—");
    await vi.waitFor(() => expect(tabsSendMessage).toHaveBeenCalledWith(42, {
      type: "DEHYPE_RETURN_FROM_SEARCH",
    }));
  });
});

function successAnalysis(analysisId: string) {
  return {
    state: "success",
    analysisId,
    result: {
      productName: "Wireless USB-C Headphones",
      status: "matched",
      explanation: "The required facts match.",
      budget: { status: "matched", explanation: "Within budget." },
      mustHave: [{ requirement: "USB-C", status: "matched", explanation: "Listed." }],
      niceToHave: [],
      exclude: [],
    },
  };
}

function element(selector: string): HTMLElement { return document.querySelector<HTMLElement>(selector)!; }
function input(selector: string): HTMLInputElement { return document.querySelector<HTMLInputElement>(selector)!; }
function textarea(selector: string): HTMLTextAreaElement { return document.querySelector<HTMLTextAreaElement>(selector)!; }
function button(selector: string): HTMLButtonElement { return document.querySelector<HTMLButtonElement>(selector)!; }
function fieldset(): HTMLFieldSetElement { return document.querySelector<HTMLFieldSetElement>("#user-need-fields")!; }
function form(): HTMLFormElement { return document.querySelector<HTMLFormElement>("#user-need-form")!; }
