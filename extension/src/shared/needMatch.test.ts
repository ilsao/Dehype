import { describe, expect, it, vi } from "vitest";

import {
  clearNeedMatchAnalysis,
  loadNeedMatchAnalysis,
  saveNeedMatchAnalysis,
  saveNeedMatchAnalysisIfCurrent,
  validateNeedMatchAnalysisState,
  type NeedMatchAnalysisState,
} from "./needMatch.js";

function createStorage(initial?: NeedMatchAnalysisState) {
  const values: Record<string, unknown> = {};

  if (initial) {
    values.needMatchAnalysis = initial;
  }

  return {
    values,
    get: vi.fn(async () => ({ ...values })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete values[key];
    }),
  };
}

const result = {
  productName: "Laptop",
  status: "matched" as const,
  explanation: "The required facts match.",
  budget: null,
  mustHave: [],
  niceToHave: [],
  exclude: [],
};

describe("Need Match storage", () => {
  it("saves, loads, and clears analysis state", async () => {
    const storage = createStorage();
    const state = { state: "success", analysisId: "one", result } as const;

    await saveNeedMatchAnalysis(storage, state);
    await expect(loadNeedMatchAnalysis(storage)).resolves.toEqual(state);

    await clearNeedMatchAnalysis(storage);
    await expect(loadNeedMatchAnalysis(storage)).resolves.toBeNull();
  });

  it("does not let an older analysis overwrite the current one", async () => {
    const storage = createStorage({ state: "analyzing", analysisId: "new" });

    await expect(
      saveNeedMatchAnalysisIfCurrent(storage, {
        state: "success",
        analysisId: "old",
        result,
      }),
    ).resolves.toBe(false);
    expect(storage.set).not.toHaveBeenCalled();
  });

  it("rejects malformed persisted results", () => {
    expect(() =>
      validateNeedMatchAnalysisState({
        state: "success",
        analysisId: "one",
        result: { ...result, status: "maybe" },
      }),
    ).toThrow("invalid");
  });
});
