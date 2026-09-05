import type {
  NeutralizeSource,
  ProductInfo,
  ProductInfoField,
} from "../shared/productInfo";
import { PRODUCT_INFO_FIELDS } from "../shared/productInfo";
import { DEHYPE_ELEMENT_ID } from "../adapters/productAdapter";
import type { NeutralizationTarget } from "../adapters/productAdapter";

const ORIGINAL_MARKER = "data-dehype-original-hidden";
const REPLACEMENT_MARKER = "data-dehype-replacement";
const SUPPRESSED_MARKER = "data-dehype-suppressed";
const DEEMPHASIZED_MARKER = "data-dehype-deemphasized";
const NEUTRAL_MODE_MARKER = "data-dehype-neutral-mode";
const LAYOUT_ROOT_MARKER = "data-dehype-layout-root";
const STYLE_ID = "dehype-inline-rebuild-style";
const CONTROL_ID = "dehype-inline-rebuild-control";

interface AttributeSnapshot {
  present: boolean;
  value: string | null;
}

interface ReplacementEntry {
  source: HTMLElement;
  replacement?: HTMLElement;
  originalMarker: AttributeSnapshot;
}

interface NeutralizationEntry {
  element: HTMLElement;
  action: NeutralizationTarget["action"];
  marker?: typeof SUPPRESSED_MARKER | typeof DEEMPHASIZED_MARKER;
  originalMarker?: AttributeSnapshot;
  originalText?: string | null;
  replacementText?: string | undefined;
  parent?: Node;
  nextSibling?: ChildNode | null;
}

export interface InlineRebuildHandle {
  readonly appliedFields: ProductInfoField[];
  readonly suppressedElementCount: number;
  readonly deemphasizedElementCount: number;
  targetsAreConnected(): boolean;
  neutralizeNewElements(): number;
  restore(): void;
}

interface InlineRebuildOptions {
  source: NeutralizeSource;
  fallbackReason?: string;
  findNeutralizationTargets: () => NeutralizationTarget[];
  neutralLayoutRoot?: HTMLElement;
  onRestore: () => void;
}

/**
 * Applies neutral values next to their source nodes without destroying Temu's
 * DOM subtrees or event handlers. All mutations are owned by the returned
 * handle and can be reversed exactly.
 */
export function applyInlineRebuild(
  sourceDocument: Document,
  productInfo: ProductInfo,
  options: InlineRebuildOptions,
): InlineRebuildHandle {
  const replacements: ReplacementEntry[] = [];
  const neutralizations = new Map<HTMLElement, NeutralizationEntry>();
  const usedSources = new Set<HTMLElement>();
  const appliedFields: ProductInfoField[] = [];
  const rootMarker = snapshotAttribute(
    sourceDocument.documentElement,
    NEUTRAL_MODE_MARKER,
  );
  sourceDocument.documentElement.setAttribute(NEUTRAL_MODE_MARKER, "true");
  const layoutRoot = options.neutralLayoutRoot?.isConnected
    ? options.neutralLayoutRoot
    : undefined;
  const layoutRootMarker = layoutRoot
    ? snapshotAttribute(layoutRoot, LAYOUT_ROOT_MARKER)
    : undefined;
  layoutRoot?.setAttribute(LAYOUT_ROOT_MARKER, "true");
  const layoutWidth = layoutRoot?.getBoundingClientRect().width;
  const style = createPageStyle(sourceDocument, layoutWidth);

  applyPriceSummary(
    sourceDocument,
    productInfo,
    replacements,
    usedSources,
    appliedFields,
  );

  for (const field of PRODUCT_INFO_FIELDS) {
    if (
      field === "image" ||
      field === "originalPrice" ||
      field === "currentPrice" ||
      field === "discount"
    ) {
      continue;
    }
    const productElement = productInfo[field];
    if (!productElement) continue;

    const source = findMarkedElement(sourceDocument, productElement.id);
    if (!source || usedSources.has(source) || !source.parentNode) continue;

    const replacement = createReplacementElement(sourceDocument, source);
    replacement.setAttribute(REPLACEMENT_MARKER, field);
    replacement.textContent = productElement.value;
    source.after(replacement);

    replacements.push({
      source,
      replacement,
      originalMarker: snapshotAttribute(source, ORIGINAL_MARKER),
    });
    source.setAttribute(ORIGINAL_MARKER, "true");
    usedSources.add(source);
    appliedFields.push(field);
  }

  const control = createRestoreControl(sourceDocument, options);

  const neutralizeNewElements = (): number => {
    let added = 0;
    const nextTargets = new Map<HTMLElement, NeutralizationTarget>();
    for (const target of options.findNeutralizationTargets()) {
      const { element } = target;
      if (
        (!element.isConnected && target.action !== "remove") ||
        ((target.action === "suppress" || target.action === "remove") &&
          replacements.some(
            ({ source, replacement }) =>
              element === source ||
              element === replacement ||
              element.contains(source) ||
              (replacement !== undefined && element.contains(replacement)),
          ))
      ) {
        continue;
      }
      nextTargets.set(element, target);
    }

    for (const [element, entry] of neutralizations) {
      const nextTarget = nextTargets.get(element);
      if (entry.action === "remove") {
        // Detached nodes disappear from adapter scans; retain ownership until restore.
        if (element.isConnected) element.remove();
        continue;
      }
      if (entry.action === "rewrite-text") {
        if (nextTarget?.action === "rewrite-text") {
          if (
            nextTarget.replacementText !== undefined &&
            element.textContent !== nextTarget.replacementText
          ) {
            element.textContent = nextTarget.replacementText;
          }
          entry.replacementText = nextTarget.replacementText;
          continue;
        }
        if (element.textContent === entry.replacementText) {
          nextTargets.delete(element);
          continue;
        }
        element.textContent = entry.originalText ?? null;
        neutralizations.delete(element);
        continue;
      }
      const nextMarker = nextTarget ? markerFor(nextTarget) : undefined;
      if (!nextTarget || nextTarget.action === "rewrite-text" || nextMarker !== entry.marker) {
        if (entry.marker && entry.originalMarker) {
          restoreAttribute(element, entry.marker, entry.originalMarker);
        }
        neutralizations.delete(element);
      }
    }

    for (const [element, target] of nextTargets) {
      const existing = neutralizations.get(element);
      if (existing?.action === "remove") continue;
      if (
        target.action === "deemphasize" &&
        hasActiveRewriteDescendant(element, neutralizations)
      ) {
        continue;
      }
      if (target.action === "rewrite-text") {
        if (!existing && target.replacementText !== undefined) {
          neutralizations.set(element, {
            element,
            action: target.action,
            originalText: element.textContent,
            replacementText: target.replacementText,
          });
          element.textContent = target.replacementText;
          added += 1;
        }
        continue;
      }
      if (target.action === "remove") {
        const parent = element.parentNode;
        if (!parent) continue;
        neutralizations.set(element, {
          element,
          action: target.action,
          parent,
          nextSibling: element.nextSibling,
        });
        element.remove();
        added += 1;
        continue;
      }
      const marker = markerFor(target);
      if (existing) {
        element.setAttribute(marker, target.presentation);
        continue;
      }
      neutralizations.set(element, {
        element,
        action: target.action,
        marker,
        originalMarker: snapshotAttribute(element, marker),
      });
      element.setAttribute(marker, target.presentation);
      added += 1;
    }
    return added;
  };

  neutralizeNewElements();
  let restored = false;

  return {
    appliedFields: PRODUCT_INFO_FIELDS.filter((field) =>
      appliedFields.includes(field),
    ),
    get suppressedElementCount() {
      return [...neutralizations.values()].filter(
        ({ marker }) => marker === SUPPRESSED_MARKER,
      ).length;
    },
    get deemphasizedElementCount() {
      return [...neutralizations.values()].filter(
        ({ marker }) => marker === DEEMPHASIZED_MARKER,
      ).length;
    },
    targetsAreConnected: () =>
      replacements.every(
        ({ source, replacement }) =>
          source.isConnected && (replacement?.isConnected ?? true),
      ) && (layoutRoot?.isConnected ?? true),
    neutralizeNewElements,
    restore: () => {
      if (restored) return;
      restored = true;
      for (const { source, replacement, originalMarker } of replacements) {
        replacement?.remove();
        restoreAttribute(source, ORIGINAL_MARKER, originalMarker);
      }
      for (const entry of [...neutralizations.values()].reverse()) {
        if (entry.action === "remove") {
          if (entry.parent?.isConnected && !entry.element.isConnected) {
            entry.parent.insertBefore(
              entry.element,
              entry.nextSibling?.parentNode === entry.parent ? entry.nextSibling : null,
            );
          }
          continue;
        }
        if (entry.action === "rewrite-text") {
          entry.element.textContent = entry.originalText ?? null;
          continue;
        }
        if (entry.marker && entry.originalMarker) {
          restoreAttribute(entry.element, entry.marker, entry.originalMarker);
        }
      }
      if (layoutRoot && layoutRootMarker) {
        restoreAttribute(layoutRoot, LAYOUT_ROOT_MARKER, layoutRootMarker);
      }
      restoreAttribute(
        sourceDocument.documentElement,
        NEUTRAL_MODE_MARKER,
        rootMarker,
      );
      control.remove();
      style.remove();
    },
  };
}

function hasActiveRewriteDescendant(
  element: HTMLElement,
  neutralizations: ReadonlyMap<HTMLElement, NeutralizationEntry>,
): boolean {
  return [...neutralizations.values()].some(
    (entry) =>
      entry.action === "rewrite-text" &&
      entry.element !== element &&
      element.contains(entry.element) &&
      entry.element.textContent === entry.replacementText,
  );
}

function markerFor(
  target: NeutralizationTarget,
): typeof SUPPRESSED_MARKER | typeof DEEMPHASIZED_MARKER {
  return target.action === "suppress"
    ? SUPPRESSED_MARKER
    : DEEMPHASIZED_MARKER;
}

function applyPriceSummary(
  sourceDocument: Document,
  productInfo: ProductInfo,
  replacements: ReplacementEntry[],
  usedSources: Set<HTMLElement>,
  appliedFields: ProductInfoField[],
): void {
  const priceEntries = (["originalPrice", "currentPrice"] as const)
    .map((field) => {
      const productElement = productInfo[field];
      if (!productElement) return undefined;
      const source = findMarkedElement(sourceDocument, productElement.id);
      return source ? { field, source, value: productElement.value } : undefined;
    })
    .filter(
      (
        entry,
      ): entry is {
        field: "originalPrice" | "currentPrice";
        source: HTMLElement;
        value: string;
      } => entry !== undefined,
    );

  if (priceEntries.length === 0) return;

  const summary = sourceDocument.createElement("div");
  summary.setAttribute("data-dehype-price-summary", "true");
  summary.setAttribute("role", "group");
  summary.setAttribute("aria-label", "Product prices");

  for (const { field, value } of priceEntries) {
    const estimated = field === "currentPrice" && /^estimated\s+/i.test(value);
    const line = sourceDocument.createElement("div");
    line.setAttribute(
      "data-dehype-price-line",
      field === "originalPrice" ? "original" : "current",
    );
    const label = sourceDocument.createElement("strong");
    label.textContent =
      field === "originalPrice"
        ? "Original price:"
        : estimated
          ? "Current estimated price:"
          : "Current price:";
    const amount = sourceDocument.createElement("span");
    amount.textContent = value.replace(/^estimated\s+/i, "");
    line.append(label, amount);
    summary.append(line);
  }

  const anchor = priceEntries[0]?.source;
  if (!anchor?.parentNode) return;
  anchor.before(summary);

  const sources = new Set(priceEntries.map(({ source }) => source));
  const discount = productInfo.discount
    ? findMarkedElement(sourceDocument, productInfo.discount.id)
    : undefined;
  if (discount?.closest("#goods_price")) sources.add(discount);

  let ownsSummary = true;
  for (const source of sources) {
    replacements.push({
      source,
      ...(ownsSummary ? { replacement: summary } : {}),
      originalMarker: snapshotAttribute(source, ORIGINAL_MARKER),
    });
    ownsSummary = false;
    source.setAttribute(ORIGINAL_MARKER, "true");
    usedSources.add(source);
  }
  for (const { field } of priceEntries) appliedFields.push(field);
}

function createPageStyle(
  sourceDocument: Document,
  layoutWidth?: number,
): HTMLStyleElement {
  sourceDocument.getElementById(STYLE_ID)?.remove();
  const style = sourceDocument.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${ORIGINAL_MARKER}="true"], [${SUPPRESSED_MARKER}] {
      display: none !important;
    }
    [${LAYOUT_ROOT_MARKER}="true"] {
      width: ${layoutWidth && layoutWidth > 0 ? `min(calc(100vw - 32px), ${layoutWidth}px)` : "auto"} !important;
      max-width: ${layoutWidth && layoutWidth > 0 ? `${layoutWidth}px` : "100%"} !important;
      margin-inline: auto !important;
      float: none !important;
    }
    html[${NEUTRAL_MODE_MARKER}="true"] body *,
    html[${NEUTRAL_MODE_MARKER}="true"] body *::before,
    html[${NEUTRAL_MODE_MARKER}="true"] body *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }
    [${REPLACEMENT_MARKER}], [data-dehype-price-summary] {
      max-width: 100% !important;
      border: 0 !important;
      border-radius: 0 !important;
      padding: 0 !important;
      color: #1f2937 !important;
      background: transparent !important;
      box-shadow: none !important;
      font-family: system-ui, sans-serif !important;
      font-style: normal !important;
      font-weight: 500 !important;
      letter-spacing: normal !important;
      text-shadow: none !important;
      animation: none !important;
      transition: none !important;
    }
    [${REPLACEMENT_MARKER}="name"] {
      color: #263238 !important;
      font-weight: 500 !important;
    }
    [${REPLACEMENT_MARKER}="currentPrice"] {
      color: #263238 !important;
      font-style: normal !important;
      font-weight: 600 !important;
    }
    [${REPLACEMENT_MARKER}="originalPrice"] {
      color: #64748b !important;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    [${REPLACEMENT_MARKER}="discount"],
    [${REPLACEMENT_MARKER}="stockAmount"] {
      color: #64748b !important;
      font-style: normal !important;
      font-weight: 400 !important;
    }
    [${REPLACEMENT_MARKER}="description"] {
      color: #334155 !important;
      font-weight: 400 !important;
    }
    [data-dehype-price-summary] {
      display: grid !important;
      gap: 3px !important;
      margin-block: 2px !important;
    }
    [data-dehype-price-line] {
      display: flex !important;
      align-items: baseline !important;
      gap: 6px !important;
      color: #263238 !important;
      background: transparent !important;
      font-size: 16px !important;
      line-height: 1.35 !important;
      text-decoration: none !important;
    }
    [data-dehype-price-line] strong {
      color: #64748b !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      text-decoration: none !important;
    }
    [data-dehype-price-line="original"] span {
      color: #64748b !important;
      font-weight: 400 !important;
      text-decoration: none !important;
    }
    [data-dehype-price-line="current"] span {
      color: #263238 !important;
      font-weight: 600 !important;
      text-decoration: none !important;
    }
    [${DEEMPHASIZED_MARKER}="neutral-surface"] {
      border: 0 !important;
      outline: 0 !important;
      color: inherit !important;
      background-color: #ffffff !important;
      background-image: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    [${DEEMPHASIZED_MARKER}="neutral-action"] {
      border-color: transparent !important;
      color: #263238 !important;
      background-color: #f1f5f9 !important;
      background-image: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    [${DEEMPHASIZED_MARKER}="neutral-action"] :not(img):not(picture):not(video) {
      color: inherit !important;
      -webkit-text-fill-color: currentColor !important;
      background-color: transparent !important;
      background-image: none !important;
    }
    [${DEEMPHASIZED_MARKER}="neutral-fact"] {
      border-color: transparent !important;
      color: #475569 !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    [${DEEMPHASIZED_MARKER}="neutral-fact"] :not(img):not(picture):not(video) {
      color: inherit !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
    }
    @media (prefers-reduced-motion: reduce) {
      [${REPLACEMENT_MARKER}] { scroll-behavior: auto !important; }
    }
  `;
  (sourceDocument.head ?? sourceDocument.documentElement).append(style);
  return style;
}

function createRestoreControl(
  sourceDocument: Document,
  options: InlineRebuildOptions,
): HTMLElement {
  sourceDocument.getElementById(CONTROL_ID)?.remove();
  const host = sourceDocument.createElement("div");
  host.id = CONTROL_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = sourceDocument.createElement("style");
  style.textContent = `
    :host { all: initial; }
    aside {
      position: fixed; z-index: 2147483647; right: 12px; bottom: 12px;
      display: flex; align-items: center; gap: 9px; max-width: 310px;
      border: 1px solid #cbd5e1; border-radius: 7px; padding: 7px 8px;
      color: #334155; background: #fff; box-shadow: 0 3px 12px #0f172a24;
      font: 12px/1.3 system-ui, sans-serif;
    }
    strong { display: block; font-size: 12px; }
    span { display: block; max-width: 205px; overflow: hidden; color: #64748b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    button {
      flex: none; border: 1px solid #94a3b8; border-radius: 5px; padding: 5px 7px;
      color: #334155; background: #fff; font: 600 11px system-ui, sans-serif;
      cursor: pointer;
    }
    button:focus-visible { outline: 3px solid #2684ff; outline-offset: 2px; }
  `;
  const aside = sourceDocument.createElement("aside");
  aside.setAttribute("aria-label", "Dehype neutral view controls");
  const copy = sourceDocument.createElement("div");
  const title = sourceDocument.createElement("strong");
  title.textContent = "Dehype neutral view is active";
  const detail = sourceDocument.createElement("span");
  detail.textContent = "Neutral view applied to this page";
  const button = sourceDocument.createElement("button");
  button.type = "button";
  button.textContent = "Restore page";
  button.addEventListener("click", options.onRestore);
  copy.append(title, detail);
  aside.append(copy, button);
  shadow.append(style, aside);
  sourceDocument.documentElement.append(host);
  return host;
}

function createReplacementElement(
  sourceDocument: Document,
  source: HTMLElement,
): HTMLElement {
  const safeTag = /^(?:H[1-6]|P|DIV|SPAN|STRONG|EM|DEL|S)$/.test(source.tagName)
    ? source.tagName.toLowerCase()
    : "span";
  const replacement = sourceDocument.createElement(safeTag);
  if (safeTag === "span") replacement.setAttribute("role", "text");

  const computed = sourceDocument.defaultView?.getComputedStyle(source);
  if (!computed) return replacement;
  for (const property of [
    "display",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "font-size",
    "line-height",
    "width",
    "max-width",
    "min-width",
    "text-align",
    "vertical-align",
    "flex-grow",
    "flex-shrink",
    "flex-basis",
    "align-self",
    "grid-column",
    "grid-row",
  ]) {
    const value = computed.getPropertyValue(property);
    if (value) replacement.style.setProperty(property, value, "important");
  }
  return replacement;
}

function findMarkedElement(
  sourceDocument: Document,
  id: string,
): HTMLElement | undefined {
  return Array.from(
    sourceDocument.querySelectorAll<HTMLElement>(`[${DEHYPE_ELEMENT_ID}]`),
  ).find(
    (element) =>
      !(element instanceof HTMLMetaElement) &&
      !(element instanceof HTMLImageElement) &&
      element.getAttribute(DEHYPE_ELEMENT_ID) === id,
  );
}

function snapshotAttribute(element: Element, name: string): AttributeSnapshot {
  return {
    present: element.hasAttribute(name),
    value: element.getAttribute(name),
  };
}

function restoreAttribute(
  element: Element,
  name: string,
  snapshot: AttributeSnapshot,
): void {
  if (!snapshot.present) {
    element.removeAttribute(name);
  } else {
    element.setAttribute(name, snapshot.value ?? "");
  }
}
