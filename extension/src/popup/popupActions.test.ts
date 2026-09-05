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
    const scriptingApi = { executeScript: vi.fn(async () => []) };

    await expect(
      sendMessageToActiveTab<{ ok: boolean }>(tabsApi, scriptingApi, { type }),
    ).resolves.toEqual({ ok: true });
    expect(tabsApi.sendMessage).toHaveBeenCalledWith(42, { type });
    expect(scriptingApi.executeScript).not.toHaveBeenCalled();
  });

  it("reports when there is no active tab", async () => {
    const tabsApi = {
      query: vi.fn(async () => []),
      sendMessage: vi.fn(),
    };
    const scriptingApi = { executeScript: vi.fn(async () => []) };

    await expect(
      sendMessageToActiveTab<{ ok: boolean }>(tabsApi, scriptingApi, {
        type: "DEHYPE_REBUILD_CURRENT_PRODUCT",
      }),
    ).rejects.toThrow("Open a product page and try again.");
  });

  it("injects the content script and retries once when no receiver exists", async () => {
    const message = { type: "DEHYPE_REBUILD_CURRENT_PRODUCT" };
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("Could not establish connection. Receiving end does not exist."),
        )
        .mockResolvedValueOnce({ ok: true }),
    };
    const scriptingApi = { executeScript: vi.fn(async () => []) };

    await expect(
      sendMessageToActiveTab<{ ok: boolean }>(tabsApi, scriptingApi, message),
    ).resolves.toEqual({ ok: true });
    expect(scriptingApi.executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["assets/content.js"],
    });
    expect(tabsApi.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not inject for unrelated messaging errors", async () => {
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => {
        throw new Error("The tab was closed.");
      }),
    };
    const scriptingApi = { executeScript: vi.fn(async () => []) };

    await expect(
      sendMessageToActiveTab(tabsApi, scriptingApi, { type: "test" }),
    ).rejects.toThrow("The tab was closed.");
    expect(scriptingApi.executeScript).not.toHaveBeenCalled();
  });

  it("surfaces the retry error without injecting a second time", async () => {
    const connectionError = new Error(
      "Could not establish connection. Receiving end does not exist.",
    );
    const tabsApi = {
      query: vi.fn(async () => [{ id: 42 }]),
      sendMessage: vi.fn(async () => {
        throw connectionError;
      }),
    };
    const scriptingApi = { executeScript: vi.fn(async () => []) };

    await expect(
      sendMessageToActiveTab(tabsApi, scriptingApi, { type: "test" }),
    ).rejects.toThrow("Receiving end does not exist");
    expect(scriptingApi.executeScript).toHaveBeenCalledOnce();
    expect(tabsApi.sendMessage).toHaveBeenCalledTimes(2);
  });

  it("shows model values without exposing DOM ids", () => {
    const values = productInfoValues({
      name: { id: "name-dom-id", value: "Wireless Earbuds" },
      currentPrice: { id: "price-dom-id", value: "$12.99" },
    });

    expect(values).toEqual({ name: "Wireless Earbuds", currentPrice: "$12.99" });
    expect(JSON.stringify(values)).not.toContain("dom-id");
  });
});
