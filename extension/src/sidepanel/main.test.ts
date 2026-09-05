import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("UserNeed Side Panel", () => {
  const storedValues: Record<string, unknown> = {};
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

    vi.stubGlobal("chrome", { storage: { local: storage } });
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
});

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
