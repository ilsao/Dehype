import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("UserNeed Side Panel", () => {
  const storedValues: Record<string, unknown> = {};
  let storageChangeListener: (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ) => void;
  let messageListener: (message: unknown) => void = () => {};
  const storage = {
    get: vi.fn(async () => storedValues),
    set: vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(storedValues, values);
    }),
    remove: vi.fn(async (key: string) => {
      delete storedValues[key];
    }),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    for (const key of Object.keys(storedValues)) {
      delete storedValues[key];
    }

    vi.stubGlobal("chrome", {
      storage: {
        local: storage,
        onChanged: {
          addListener: vi.fn((listener) => {
            storageChangeListener = listener;
          }),
        },
      },
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => {
            messageListener = listener;
          }),
        },
      },
    });
    document.body.innerHTML = `
      <span id="mode-label"></span>
      <form id="user-need-form">
        <fieldset id="user-need-fields">
          <input id="min-budget">
          <input id="max-budget">
          <textarea id="must-have"></textarea>
          <textarea id="nice-to-have"></textarea>
          <textarea id="exclude"></textarea>
        </fieldset>
        <button id="save-button" type="submit">Save</button>
        <button id="edit-button" type="button">Edit</button>
        <button id="reset-button" type="button">Reset</button>
      </form>
      <section id="summary-section" hidden>
        <span id="summary-state"></span>
        <span id="summary-min-budget"></span>
        <span id="summary-max-budget"></span>
        <ul id="summary-must-have"></ul>
        <ul id="summary-nice-to-have"></ul>
        <ul id="summary-exclude"></ul>
      </section>
      <section id="need-match-section" hidden>
        <span id="need-match-status"></span>
        <p id="need-match-product"></p>
        <p id="need-match-explanation"></p>
        <div id="need-match-details"></div>
      </section>
      <section id="price-comparison-section" hidden>
        <button id="return-to-needs" type="button">Back</button>
        <p id="price-status"></p>
        <div class="price-chart-heading"><span>Price distribution</span><span id="price-budget-label"></span></div>
        <div id="price-chart"></div>
        <div class="price-summary-grid">
          <div><span>Minimum</span><strong id="price-min"></strong></div>
          <div><span>Median</span><strong id="price-median"></strong></div>
          <div><span>Maximum</span><strong id="price-max"></strong></div>
        </div>
      </section>
      <footer id="status"></footer>
    `;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("previews, saves, edits, and resets user needs", async () => {
    await import("./main.js");
    await vi.waitFor(() => {
      expect(element("#status").textContent).toBe("Enter your user needs.");
    });
    expect(element("#summary-section").hidden).toBe(true);

    const minBudget = input("#min-budget");
    const maxBudget = input("#max-budget");
    const mustHave = textarea("#must-have");
    minBudget.value = "100";
    maxBudget.value = "500";
    mustHave.value = "USB-C\nQuiet fan";
    mustHave.dispatchEvent(new Event("input", { bubbles: true }));

    expect(element("#summary-section").hidden).toBe(true);

    form().dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(storage.set).toHaveBeenCalledOnce();
      expect(fieldset().disabled).toBe(true);
      expect(fieldset().hidden).toBe(true);
      expect(element("#summary-section").hidden).toBe(false);
      expect(element("#summary-state").textContent).toBe("Saved");
    });

    expect(element("#summary-min-budget").textContent).toBe("100");
    expect(element("#summary-max-budget").textContent).toBe("500");
    expect(element("#summary-must-have").textContent).toContain("USB-C");
    expect(button("#save-button").hidden).toBe(true);
    expect(button("#edit-button").hidden).toBe(false);
    expect(button("#edit-button").disabled).toBe(false);
    expect(button("#reset-button").hidden).toBe(false);

    button("#edit-button").click();
    expect(fieldset().disabled).toBe(false);
    expect(fieldset().hidden).toBe(false);
    expect(button("#save-button").hidden).toBe(false);
    expect(button("#save-button").disabled).toBe(false);
    expect(button("#edit-button").hidden).toBe(true);
    expect(element("#summary-section").hidden).toBe(true);

    mustHave.value = "Updated requirement";
    form().dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() => {
      expect(storage.set).toHaveBeenCalledTimes(2);
      expect(element("#summary-section").hidden).toBe(false);
      expect(element("#summary-must-have").textContent).toContain(
        "Updated requirement",
      );
    });

    button("#reset-button").click();
    await vi.waitFor(() => {
      expect(storage.remove).toHaveBeenCalledWith("userNeed");
      expect(minBudget.value).toBe("");
      expect(element("#summary-section").hidden).toBe(true);
    });

    expect(maxBudget.value).toBe("");
    expect(mustHave.value).toBe("");
    expect(fieldset().disabled).toBe(false);
    expect(fieldset().hidden).toBe(false);
    expect(button("#save-button").hidden).toBe(false);
    expect(button("#edit-button").hidden).toBe(true);
  });

  it("starts collapsed when saved user needs are loaded", async () => {
    storedValues.userNeed = {
      minBudget: 100,
      maxBudget: 500,
      mustHave: ["USB-C"],
      niceToHave: [],
      exclude: [],
    };

    await import("./main.js");
    await vi.waitFor(() => {
      expect(element("#status").textContent).toBe("Saved user needs loaded.");
      expect(fieldset().hidden).toBe(true);
      expect(element("#summary-section").hidden).toBe(false);
    });

    expect(button("#save-button").hidden).toBe(true);
    expect(button("#edit-button").hidden).toBe(false);
    expect(button("#reset-button").hidden).toBe(false);
    expect(element("#summary-min-budget").textContent).toBe("100");
    expect(element("#summary-must-have").textContent).toContain("USB-C");
  });

  it("loads, updates, and clears Need Match Analysis", async () => {
    storedValues.userNeed = {
      minBudget: null,
      maxBudget: 500,
      mustHave: ["USB-C"],
      niceToHave: [],
      exclude: [],
    };
    storedValues.needMatchAnalysis = successAnalysis("first");

    await import("./main.js");
    await vi.waitFor(() => {
      expect(element("#need-match-section").hidden).toBe(false);
      expect(element("#need-match-status").textContent).toBe("matched");
      expect(element("#need-match-product").textContent).toBe(
        "Plus Size Floral Paisley 3/4 Sleeve Tunic",
      );
      expect(element("#need-match-details").textContent).toContain("USB-C");
    });
    expect(element("#need-match-product").textContent).not.toContain(
      "Multicolor Casual Party Travel Birthday",
    );
    expect(element("#need-match-details").textContent).toContain("✓Budget");
    expect(element("#need-match-details").textContent).toContain("✓USB-C");
    expect(element("#need-match-details").textContent).toContain("✕Quiet fan");
    expect(element("#need-match-details").textContent).toContain(
      "?Subscription",
    );
    expect(element("#need-match-details").textContent).not.toContain(
      "The price is within budget.",
    );
    expect(element("#need-match-details").textContent).not.toContain(
      "USB-C is listed.",
    );
    expect(
      document.querySelector<HTMLElement>(
        '.assessment-row[data-match-status="matched"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '.assessment-row[data-match-status="mismatched"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector<HTMLElement>(
        '.assessment-row[data-match-status="unknown"]',
      ),
    ).not.toBeNull();

    storageChangeListener(
      {
        needMatchAnalysis: {
          oldValue: successAnalysis("first"),
          newValue: { state: "analyzing", analysisId: "second" },
        },
      },
      "local",
    );
    expect(element("#need-match-status").textContent).toBe("Analyzing");

    button("#edit-button").click();
    expect(element("#need-match-section").hidden).toBe(true);
    await vi.waitFor(() => {
      expect(storage.remove).toHaveBeenCalledWith("needMatchAnalysis");
    });
  });

  it("renders price comparison without redundant info, without budget range card, and highlights budget on chart", async () => {
    storedValues.userNeed = {
      minBudget: 3,
      maxBudget: 8,
      mustHave: [],
      niceToHave: [],
      exclude: [],
    };

    await import("./main.js");
    await vi.waitFor(() => {
      expect(element("#status").textContent).toBe("Saved user needs loaded.");
    });

    messageListener({
      type: "DEHYPE_PRICE_COMPARISON_RESULT",
      source: "dom",
      productName: "Long Title Should Not Appear",
      searchKeyword: "Search Keyword Should Not Appear",
      min: 2.5,
      max: 15.0,
      median: 7.0,
      products: [
        { price: 2.5, currency: "USD", name: "P1" },
        { price: 4.5, currency: "USD", name: "P2" },
        { price: 7.0, currency: "USD", name: "P3" },
        { price: 10.0, currency: "USD", name: "P4" },
        { price: 15.0, currency: "USD", name: "P5" },
      ],
    });

    expect(element("#price-comparison-section").hidden).toBe(false);
    expect(document.querySelector("#price-product-name")).toBeNull();
    expect(document.querySelector("#price-count")).toBeNull();
    expect(document.querySelector("#price-budget-summary")).toBeNull();
    expect(element("#price-status").textContent).toBe("");
    expect(element("#price-min").textContent).toBe("2.50 USD");
    expect(element("#price-median").textContent).toBe("7.00 USD");
    expect(element("#price-max").textContent).toBe("15.00 USD");
    expect(element("#price-budget-label").textContent).toBe("Budget: 3.00 USD - 8.00 USD");

    const inBudgetColumns = document.querySelectorAll(".price-bar-column.in-budget");
    expect(inBudgetColumns.length).toBeGreaterThan(0);

    const outsideColumns = document.querySelectorAll(".price-bar-column:not(.in-budget)");
    expect(outsideColumns.length).toBeGreaterThan(0);

    // Each column contains count and bar, and label is a sibling in price-bar-group
    const firstInBudget = inBudgetColumns[0];
    expect(firstInBudget?.querySelector(".price-bar")).not.toBeNull();
    expect(firstInBudget?.querySelector(".price-bar-count")).not.toBeNull();
    expect(firstInBudget?.getAttribute("title")).toBe("Within your budget range");
  });
});

function successAnalysis(analysisId: string) {
  return {
    state: "success",
    analysisId,
    result: {
      productName:
        "2D Flat Printing Plus Size Floral Paisley Women's Elegant Comfortable 3/4 Sleeve Doll Shirt Ladies Chic 3/4 Sleeve Tunic Top Fun Floral Pattern Design Multicolor Casual Party Travel Birthday, 2D Flat",
      status: "matched",
      explanation: "The required facts match.",
      budget: {
        status: "matched",
        explanation: "The price is within budget.",
      },
      mustHave: [
        {
          requirement: "USB-C",
          status: "matched",
          explanation: "USB-C is listed.",
        },
      ],
      niceToHave: [
        {
          requirement: "Quiet fan",
          status: "mismatched",
          explanation: "Noise is not discussed.",
        },
      ],
      exclude: [
        {
          requirement: "Subscription",
          status: "unknown",
          explanation: "Subscription is not specified.",
        },
      ],
    },
  };
}

function element(selector: string): HTMLElement {
  return document.querySelector<HTMLElement>(selector)!;
}

function input(selector: string): HTMLInputElement {
  return document.querySelector<HTMLInputElement>(selector)!;
}

function textarea(selector: string): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>(selector)!;
}

function button(selector: string): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>(selector)!;
}

function fieldset(): HTMLFieldSetElement {
  return document.querySelector<HTMLFieldSetElement>("#user-need-fields")!;
}

function form(): HTMLFormElement {
  return document.querySelector<HTMLFormElement>("#user-need-form")!;
}
