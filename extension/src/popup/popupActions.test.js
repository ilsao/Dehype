import { describe, expect, it, vi } from "vitest";

import {
  productInfoValues,
  sendMessageToActiveTab,
} from "./popupActions.js";

const productInfo = {
  name: { id: "name-dom-id", value: "Wireless Earbuds" },
  currentPrice: { id: "price-dom-id", value: "$12.99" },
};

describe("popup actions", () => {
  it("validates the rebuild response from the active tab", async () => {
    const response = {
      type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT",
      productInfo,
      source: "structural",
      appliedFields: ["name", "currentPrice"],
      suppressedElementCount: 0,
      deemphasizedElementCount: 0,
    };
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => response),
    };

    await expect(
      sendMessageToActiveTab(tabsApi, {
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
      }),
    ).resolves.toEqual(response);
    expect(tabsApi.sendMessage).toHaveBeenCalledWith(42, {
      type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
    });
  });

  it("validates restore acknowledgements", async () => {
    const response = { type: "DEHYPE_RESTORE_CURRENT_PRODUCT_RESULT" };
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => response),
    };
    await expect(
      sendMessageToActiveTab(tabsApi, {
        type: "DEHYPE_RESTORE_CURRENT_PRODUCT",
      }),
    ).resolves.toEqual(response);
  });

  it("injects the built content script and retries when no receiver exists", async () => {
    const response = {
      type: "DEHYPE_REBUILD_CURRENT_PRODUCT_RESULT",
      productInfo,
      source: "structural",
      appliedFields: ["name", "currentPrice"],
      suppressedElementCount: 0,
      deemphasizedElementCount: 0,
    };
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(
          new Error(
            "Could not establish connection. Receiving end does not exist.",
          ),
        )
        .mockResolvedValueOnce(response),
    };
    const scriptingApi = { executeScript: vi.fn(async () => undefined) };

    await expect(
      sendMessageToActiveTab(
        tabsApi,
        { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" },
        scriptingApi,
      ),
    ).resolves.toEqual(response);
    expect(scriptingApi.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["assets/content.js"],
    });
    expect(tabsApi.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("returns an actionable message when recovery injection fails", async () => {
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => {
        throw new Error(
          "Could not establish connection. Receiving end does not exist.",
        );
      }),
    };
    const scriptingApi = {
      executeScript: vi.fn(async () => {
        throw new Error("The page cannot be scripted.");
      }),
    };

    await expect(
      sendMessageToActiveTab(
        tabsApi,
        { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" },
        scriptingApi,
      ),
    ).rejects.toThrow("Reload the Temu page and try again");
  });

  it("rejects missing, malformed, and explicit error responses", async () => {
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => undefined),
    };
    await expect(
      sendMessageToActiveTab(tabsApi, {
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
      }),
    ).rejects.toThrow("invalid analysis response");

    tabsApi.sendMessage.mockResolvedValue({
      type: "DEHYPE_CONTENT_SCRIPT_ERROR",
      operation: "rebuild",
      message: "No product found.",
    });
    await expect(
      sendMessageToActiveTab(tabsApi, {
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
      }),
    ).rejects.toThrow("No product found.");
  });

  it("reports when there is no active tab", async () => {
    const tabsApi = {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
    };
    await expect(
      sendMessageToActiveTab(tabsApi, {
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
      }),
    ).rejects.toThrow("Open a product page and try again.");
  });

  it("shows values without exposing DOM ids", () => {
    const values = productInfoValues(productInfo);
    expect(values).toEqual({ name: "Wireless Earbuds", currentPrice: "$12.99" });
    expect(JSON.stringify(values)).not.toContain("dom-id");
  });
});
