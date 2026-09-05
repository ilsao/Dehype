import type {
  NeutralizeSource,
  ProductInfo,
  ProductInfoField,
} from "../shared/productInfo";
import { PRODUCT_INFO_FIELDS } from "../shared/productInfo";
import { DEHYPE_ELEMENT_ID } from "../adapters/productAdapter";

const ORIGINAL_MARKER = "data-dehype-original-hidden";
const REPLACEMENT_MARKER = "data-dehype-replacement";
const SUPPRESSED_MARKER = "data-dehype-suppressed";
const STYLE_ID = "dehype-inline-rebuild-style";
const CONTROL_ID = "dehype-inline-rebuild-control";

interface AttributeSnapshot {
  present: boolean;
  value: string | null;
}

interface ReplacementEntry {
  field: ProductInfoField;
  source: HTMLElement;
  replacement: HTMLElement;
  originalMarker: AttributeSnapshot;
}

interface SuppressionEntry {
  element: HTMLElement;
  originalMarker: AttributeSnapshot;
}

export interface InlineRebuildHandle {
  readonly appliedFields: ProductInfoField[];
  readonly suppressedElementCount: number;
  targetsAreConnected(): boolean;
  suppressNewElements(): number;
  restore(): void;
}

interface InlineRebuildOptions {
  source: NeutralizeSource;
  fallbackReason?: string;
  findSuppressibleElements: () => HTMLElement[];
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
  const suppressions: SuppressionEntry[] = [];
  const usedSources = new Set<HTMLElement>();
  const style = createPageStyle(sourceDocument);

  for (const field of PRODUCT_INFO_FIELDS) {
    if (field === "image") continue;
    const productElement = productInfo[field];
    if (!productElement) continue;

    const source = findMarkedElement(sourceDocument, productElement.id);
    if (!source || usedSources.has(source) || !source.parentNode) continue;

    const replacement = sourceDocument.createElement("span");
    replacement.setAttribute(REPLACEMENT_MARKER, field);
    replacement.setAttribute("role", "text");
    replacement.textContent = productElement.value;
    source.after(replacement);

    replacements.push({
      field,
      source,
      replacement,
      originalMarker: snapshotAttribute(source, ORIGINAL_MARKER),
    });
    source.setAttribute(ORIGINAL_MARKER, "true");
    usedSources.add(source);
  }

  const control = createRestoreControl(sourceDocument, options);

  const suppressNewElements = (): number => {
    let added = 0;
    for (const element of options.findSuppressibleElements()) {
      if (
        !element.isConnected ||
        element.hasAttribute(SUPPRESSED_MARKER) ||
        replacements.some(
          ({ source, replacement }) =>
            element === source ||
            element === replacement ||
            element.contains(source) ||
            element.contains(replacement),
        )
      ) {
        continue;
      }
      suppressions.push({
        element,
        originalMarker: snapshotAttribute(element, SUPPRESSED_MARKER),
      });
      element.setAttribute(SUPPRESSED_MARKER, "true");
      added += 1;
    }
    return added;
  };

  suppressNewElements();
  let restored = false;

  return {
    appliedFields: replacements.map(({ field }) => field),
    get suppressedElementCount() {
      return suppressions.length;
    },
    targetsAreConnected: () =>
      replacements.every(
        ({ source, replacement }) => source.isConnected && replacement.isConnected,
      ),
    suppressNewElements,
    restore: () => {
      if (restored) return;
      restored = true;
      for (const { source, replacement, originalMarker } of replacements) {
        replacement.remove();
        restoreAttribute(source, ORIGINAL_MARKER, originalMarker);
      }
      for (const { element, originalMarker } of suppressions) {
        restoreAttribute(element, SUPPRESSED_MARKER, originalMarker);
      }
      control.remove();
      style.remove();
    },
  };
}

function createPageStyle(sourceDocument: Document): HTMLStyleElement {
  sourceDocument.getElementById(STYLE_ID)?.remove();
  const style = sourceDocument.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    [${ORIGINAL_MARKER}="true"], [${SUPPRESSED_MARKER}="true"] {
      display: none !important;
    }
    [${REPLACEMENT_MARKER}] {
      display: inline-block !important;
      max-width: 100% !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 0.35rem !important;
      padding: 0.2em 0.45em !important;
      color: #1f2937 !important;
      background: #f8fafc !important;
      box-shadow: none !important;
      font-family: system-ui, sans-serif !important;
      font-style: normal !important;
      font-weight: 500 !important;
      letter-spacing: normal !important;
      text-shadow: none !important;
      animation: none !important;
      transition: none !important;
    }
    [${REPLACEMENT_MARKER}="name"],
    [${REPLACEMENT_MARKER}="description"],
    [${REPLACEMENT_MARKER}="stockAmount"] {
      display: block !important;
      margin-block: 0.25rem !important;
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
      position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;
      display: flex; align-items: center; gap: 12px; max-width: 360px;
      border: 1px solid #94a3b8; border-radius: 10px; padding: 10px 12px;
      color: #1e293b; background: #fff; box-shadow: 0 8px 28px #0f172a33;
      font: 13px/1.4 system-ui, sans-serif;
    }
    strong { display: block; font-size: 13px; }
    span { display: block; color: #52616f; font-size: 11px; }
    button {
      flex: none; border: 1px solid #64748b; border-radius: 6px; padding: 7px 10px;
      color: #1e293b; background: #fff; font: 600 12px system-ui, sans-serif;
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
  detail.textContent = options.fallbackReason
    ? `On-device fallback: ${options.fallbackReason}`
    : options.source === "model"
      ? "AI-assisted result applied to this page"
      : "On-device result applied to this page";
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
