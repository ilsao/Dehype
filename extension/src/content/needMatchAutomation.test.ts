import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import type { UserNeed } from "../shared/userNeed";

const firstProductUrl =
  "https://www.temu.com/ca/sample-product-g-123456789.html";
const secondProductUrl =
  "https://www.temu.com/ca/another-product-g-987654321.html";

const userNeed: UserNeed = {
  minBudget: 0,
  maxBudget: 100,
  mustHave: ["USB-C"],
  niceToHave: ["lightweight"],
  exclude: ["used"],
};

let storedValues: Record<string, unknown>;
let storageChangeListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | undefined;
const nativePushState = window.history.pushState;
const nativeReplaceState = window.history.replaceState;

function renderProduct(name = "HOT SALE Wireless Earbuds!", price = "$12.99") {
  document.body.innerHTML = `
    <main>
      <h1 class="_25g_jM0z">${name}</h1>
      <div data-testid="current-price">
        <span id="price-child">${price} today only</span>
      </div>
      <img data-main-image src="https://example.test/product.png" alt="Product">
    </main>
  `;
}

async function importContentScript() {
  vi.resetModules();
  await import("./index");
}

async function flushNeedMatchDebounce() {
  await vi.advanceTimersByTimeAsync(300);
  await Promise.resolve();
}

function getSendMessageMock(): Mock {
  return chrome.runtime.sendMessage as unknown as Mock;
}

beforeEach(() => {
  vi.useFakeTimers();
  storageChangeListener = undefined;
  storedValues = {};
  window.__dehypeStopNeedMatchAutomation?.();
  window.history.pushState = nativePushState;
  window.history.replaceState = nativeReplaceState;
  delete window.__dehypeContentScriptInitialized;
  delete window.__dehypeNeedMatchHistoryPatched;
  delete window.__dehypeSkipInitialNeedMatch;
  document.head.innerHTML = "";
  renderProduct();
  window.history.replaceState({}, "", firstProductUrl);
  vi.stubGlobal("chrome", {
    runtime: {
      onMessage: { addListener: vi.fn() },
      sendMessage: vi.fn(async () => ({
        type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES_RESULT",
        ok: true,
      })),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ ...storedValues })),
      },
      onChanged: {
        addListener: vi.fn((listener) => {
          storageChangeListener = listener;
        }),
      },
    },
  });
});

afterEach(() => {
  window.__dehypeStopNeedMatchAutomation?.();
  vi.useRealTimers();
  window.history.pushState = nativePushState;
  window.history.replaceState = nativeReplaceState;
  delete window.__dehypeContentScriptInitialized;
  delete window.__dehypeNeedMatchHistoryPatched;
  delete window.__dehypeSkipInitialNeedMatch;
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("Need Match automatic content triggers", () => {
  it("analyzes the current product after UserNeed is saved", async () => {
    await importContentScript();
    await flushNeedMatchDebounce();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    storedValues.userNeed = userNeed;
    storageChangeListener?.(
      { userNeed: { oldValue: undefined, newValue: userNeed } },
      "local",
    );
    await flushNeedMatchDebounce();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES",
      productValues: expect.objectContaining({
        name: "HOT SALE Wireless Earbuds!",
        currentPrice: "$12.99",
      }),
    });
    const message = getSendMessageMock().mock.calls[0]?.[0];
    expect(JSON.stringify(message)).not.toContain("price-child");
    expect(JSON.stringify(message)).not.toContain('"id"');
  });

  it("analyzes a new single product page when the URL changes", async () => {
    storedValues.userNeed = userNeed;
    await importContentScript();
    await flushNeedMatchDebounce();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

    getSendMessageMock().mockClear();
    renderProduct("HOT SALE Travel Mug!", "CA$18.00");
    window.history.pushState({}, "", secondProductUrl);
    await flushNeedMatchDebounce();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "DEHYPE_ANALYZE_NEED_MATCH_VALUES",
      productValues: expect.objectContaining({
        name: "HOT SALE Travel Mug!",
        currentPrice: "CA$18.00",
      }),
    });
  });

  it("does not repeat the same product and UserNeed signature", async () => {
    storedValues.userNeed = userNeed;
    await importContentScript();
    await flushNeedMatchDebounce();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);

    storageChangeListener?.(
      { userNeed: { oldValue: userNeed, newValue: userNeed } },
      "local",
    );
    await flushNeedMatchDebounce();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("does not analyze unsupported pages", async () => {
    window.history.replaceState({}, "", "https://www.temu.com/ca/search?q=phone");
    storedValues.userNeed = userNeed;

    await importContentScript();
    await flushNeedMatchDebounce();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it("skips initial analysis when the popup injected the script for Neutralize", async () => {
    storedValues.userNeed = userNeed;
    window.__dehypeSkipInitialNeedMatch = true;

    await importContentScript();
    await flushNeedMatchDebounce();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(window.__dehypeSkipInitialNeedMatch).toBe(false);
  });
});
