import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEHYPE_ELEMENT_ID } from "../adapters/productAdapter";
import { applyInlineRebuild } from "./inlineRebuilder";

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

afterEach(() => {
  document.documentElement
    .querySelectorAll("#dehype-inline-rebuild-control, #dehype-inline-rebuild-style")
    .forEach((element) => element.remove());
});

describe("inline page rebuilder", () => {
  it("inserts neutral values without destroying source descendants", () => {
    document.body.innerHTML = `
      <h1 ${DEHYPE_ELEMENT_ID}="name-id"><span id="kept-child">Hot sale Mug!</span></h1>
      <div data-dehype-persuasion id="promo">Flash sale</div>
    `;
    const source = document.querySelector<HTMLElement>("h1");
    const child = document.querySelector("#kept-child");
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Mug" } },
      {
        source: "local",
        findSuppressibleElements: () => [
          document.querySelector<HTMLElement>("#promo")!,
        ],
        onRestore: vi.fn(),
      },
    );

    expect(handle.appliedFields).toEqual(["name"]);
    expect(handle.suppressedElementCount).toBe(1);
    expect(source?.textContent).toBe("Hot sale Mug!");
    expect(child?.isConnected).toBe(true);
    expect(document.querySelector('[data-dehype-replacement="name"]')?.textContent)
      .toBe("Mug");
    expect(document.querySelector("#promo")?.getAttribute("data-dehype-suppressed"))
      .toBe("true");

    handle.restore();
    expect(child?.isConnected).toBe(true);
    expect(source?.hasAttribute("data-dehype-original-hidden")).toBe(false);
    expect(document.querySelector("[data-dehype-replacement]")).toBeNull();
    expect(document.querySelector("#promo")?.hasAttribute("data-dehype-suppressed"))
      .toBe(false);
  });

  it("does not count metadata-only values as visible page fields", () => {
    document.head.innerHTML = `<meta property="og:title" ${DEHYPE_ELEMENT_ID}="metadata-name" content="Mug">`;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "metadata-name", value: "Mug" } },
      {
        source: "model",
        findSuppressibleElements: () => [],
        onRestore: vi.fn(),
      },
    );

    expect(handle.appliedFields).toEqual([]);
    expect(document.querySelector("[data-dehype-replacement]")).toBeNull();
    handle.restore();
  });

  it("restores pre-existing extension marker values and is idempotent", () => {
    document.body.innerHTML = `
      <h1 ${DEHYPE_ELEMENT_ID}="name-id" data-dehype-original-hidden="legacy">Mug</h1>
      <aside id="promo" data-dehype-suppressed="legacy">Limited time</aside>
    `;
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "local",
        findSuppressibleElements: () => [
          document.querySelector<HTMLElement>("#promo")!,
        ],
        onRestore: vi.fn(),
      },
    );

    handle.restore();
    handle.restore();
    expect(document.querySelector("h1")?.getAttribute("data-dehype-original-hidden"))
      .toBe("legacy");
    expect(document.querySelector("#promo")?.getAttribute("data-dehype-suppressed"))
      .toBe("legacy");
  });

  it("suppresses promotional elements inserted after activation", () => {
    document.body.innerHTML = `<h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>`;
    const candidates: HTMLElement[] = [];
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      {
        source: "local",
        findSuppressibleElements: () => candidates,
        onRestore: vi.fn(),
      },
    );
    const latePromo = document.createElement("div");
    latePromo.textContent = "Flash sale";
    document.body.append(latePromo);
    candidates.push(latePromo);

    expect(handle.suppressNewElements()).toBe(1);
    expect(handle.suppressedElementCount).toBe(1);
    handle.restore();
    expect(latePromo.hasAttribute("data-dehype-suppressed")).toBe(false);
  });

  it("exposes a keyboard-operable page restore control", () => {
    document.body.innerHTML = `<h1 ${DEHYPE_ELEMENT_ID}="name-id">Mug</h1>`;
    const onRestore = vi.fn();
    const handle = applyInlineRebuild(
      document,
      { name: { id: "name-id", value: "Neutral mug" } },
      { source: "local", findSuppressibleElements: () => [], onRestore },
    );
    const host = document.querySelector<HTMLElement>("#dehype-inline-rebuild-control");
    const button = host?.shadowRoot?.querySelector<HTMLButtonElement>("button");

    button?.click();
    expect(button?.type).toBe("button");
    expect(onRestore).toHaveBeenCalledOnce();
    handle.restore();
  });
});
