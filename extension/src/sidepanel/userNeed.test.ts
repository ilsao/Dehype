import { describe, expect, it, vi } from "vitest";

import {
  USER_NEED_STORAGE_KEY,
  emptyUserNeed,
  loadUserNeed,
  parseUserNeedForm,
  resetUserNeed,
  saveUserNeed,
} from "./userNeed.js";

const emptyForm = {
  minBudget: "",
  maxBudget: "",
  mustHave: "",
  niceToHave: "",
  exclude: "",
};

describe("UserNeed", () => {
  it("normalizes an empty form", () => {
    expect(parseUserNeedForm(emptyForm)).toEqual(emptyUserNeed());
  });

  it("normalizes budgets and one-item-per-line lists", () => {
    expect(
      parseUserNeedForm({
        minBudget: " 100 ",
        maxBudget: "500",
        mustHave: "USB-C\n\n  Quiet fan  ",
        niceToHave: "Blue\r\nLightweight",
        exclude: "Subscription\nUsed",
      }),
    ).toEqual({
      minBudget: 100,
      maxBudget: 500,
      mustHave: ["USB-C", "Quiet fan"],
      niceToHave: ["Blue", "Lightweight"],
      exclude: ["Subscription", "Used"],
    });
  });

  it.each([
    ["-1", "", "Minimum budget must be a non-negative number."],
    ["", "not-a-number", "Maximum budget must be a non-negative number."],
    ["500", "100", "Minimum budget cannot exceed maximum budget."],
  ])("rejects invalid budget values", (minBudget, maxBudget, message) => {
    expect(() =>
      parseUserNeedForm({ ...emptyForm, minBudget, maxBudget }),
    ).toThrow(message);
  });

  it("saves and loads user needs from browser storage", async () => {
    const values: Record<string, unknown> = {};
    const storage = {
      get: vi.fn(async () => values),
      set: vi.fn(async (next: Record<string, unknown>) => {
        Object.assign(values, next);
      }),
    };
    const userNeed = {
      minBudget: 50,
      maxBudget: 200,
      mustHave: ["USB-C"],
      niceToHave: [],
      exclude: ["Subscription"],
    };

    await saveUserNeed(storage, userNeed);

    expect(storage.set).toHaveBeenCalledWith({
      [USER_NEED_STORAGE_KEY]: userNeed,
    });
    await expect(loadUserNeed(storage)).resolves.toEqual(userNeed);
  });

  it("returns null when no saved user needs exist", async () => {
    const storage = { get: vi.fn(async () => ({})) };

    await expect(loadUserNeed(storage)).resolves.toBeNull();
  });

  it("clears saved user needs", async () => {
    const storage = { remove: vi.fn(async () => undefined) };

    await resetUserNeed(storage);

    expect(storage.remove).toHaveBeenCalledWith(USER_NEED_STORAGE_KEY);
  });

  it("surfaces browser storage failures", async () => {
    const loadFailure = {
      get: vi.fn(async () => {
        throw new Error("Storage unavailable");
      }),
    };
    const saveFailure = {
      set: vi.fn(async () => {
        throw new Error("Storage unavailable");
      }),
    };
    const resetFailure = {
      remove: vi.fn(async () => {
        throw new Error("Storage unavailable");
      }),
    };

    await expect(loadUserNeed(loadFailure)).rejects.toThrow("Storage unavailable");
    await expect(saveUserNeed(saveFailure, emptyUserNeed())).rejects.toThrow(
      "Storage unavailable",
    );
    await expect(resetUserNeed(resetFailure)).rejects.toThrow(
      "Storage unavailable",
    );
  });
});
