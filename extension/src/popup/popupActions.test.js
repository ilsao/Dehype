import { describe, expect, it, vi } from "vitest";

import {
  productInfoValues,
  sendMessageToActiveTab,
} from "./popupActions.js";

describe("popup actions", () => {
  it.each([
    "DEHYPE_REBUILD_CURRENT_PRODUCT",
    "DEHYPE_RESTORE_CURRENT_PRODUCT",
  ])("sends %s to the active tab", async (type) => {
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => ({ ok: true })),
    };

    await expect(sendMessageToActiveTab(tabsApi, { type })).resolves.toEqual({
      ok: true,
    });
    expect(tabsApi.sendMessage).toHaveBeenCalledWith(42, { type });
  });

  it("reports when there is no active tab", async () => {
    const tabsApi = {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
    };

    await expect(
      sendMessageToActiveTab(tabsApi, { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" }),
    ).rejects.toThrow("Open a product page and try again.");
  });

  it("shows model values without exposing DOM ids", () => {
    const values = productInfoValues({
      name: { id: "name-dom-id", value: "Wireless Earbuds" },
      realPrize: { id: "price-dom-id", value: "$12.99" },
    });

    expect(values).toEqual({ name: "Wireless Earbuds", realPrize: "$12.99" });
    expect(JSON.stringify(values)).not.toContain("dom-id");
  });
});
