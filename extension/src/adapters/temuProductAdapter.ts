import type { ProductElement, ProductInfo } from "../shared/productInfo";
import {
  DEHYPE_ELEMENT_ID,
  type NeutralizationAction,
  type NeutralizationPresentation,
  type NeutralizationReason,
  type NeutralizationTarget,
  type ProductAdapter,
} from "./productAdapter";

type IdFactory = (element?: Element) => string;

const TEMU_HOSTS = new Set(["temu.com", "www.temu.com"]);
const DISCOUNT_SELECTOR = "._1lS1CJSS.PjdWJn3s";
const SUPPRESSION_RULES = [
  {
    reason: "countdown",
    selectors: [
      '[data-testid*="countdown" i]',
      '[aria-label*="countdown" i]',
      '[class*="countdown" i]',
      '#mainHeader ._33LMUpZn',
    ],
  },
  {
    reason: "promotion",
    selectors: [
      "#mainStickyBenefitBar",
      '[data-dehype-persuasion]',
      '[data-testid*="coupon" i]',
      '[data-testid*="flash-sale" i]',
      '[data-testid*="lightning" i]',
      '[data-dehype-promotion-container]',
      "._2wEgFFPz.PjdWJn3s",
      "._188rnzBo.PjdWJn3s",
      ".Y3CaoPDB",
    ],
  },
  {
    reason: "gamification",
    selectors: ['[data-testid*="gamification" i]', '[data-testid*="spin" i]'],
  },
  {
    reason: "upsell",
    selectors: ['[data-testid*="upsell" i]'],
  },
  {
    reason: "recommendation",
    selectors: [
      "#goodsRecommend",
      '[data-testid*="recommendation" i]',
      '[class*="goodsRecommend"]',
      "._2z705OMN",
    ],
  },
] as const satisfies readonly {
  reason: NeutralizationReason;
  selectors: readonly string[];
}[];

const TEXT_SUPPRESSION_RULES = [
  {
    reason: "countdown",
    pattern:
      /(?:\bends? in\b.*\b(?:days?|hours?|minutes?|seconds?)\b|\b\d{1,2}:\d{2}:\d{2}\b|倒數|倒计时)/i,
  },
  {
    reason: "scarcity",
    pattern: /(?:\bonly\s+\d+\s+left\b|僅剩\s*\d+|仅剩\s*\d+)/i,
  },
  {
    reason: "social-proof",
    pattern:
      /(?:^\s*\d+(?:[.,]\d+)?\s*[km萬万]?\+?\s*(?:sold|已售|售出)\s*$|(?:#\d+\s*)?(?:top rated|best[- ]seller|熱銷排行|热销排行))/i,
  },
  {
    reason: "promotion",
    pattern:
      /(?:^\s*big sale\s*$|^\s*\d+(?:[.,]\d+)?%\s*off(?:\s+on orders)?\s*$|after applying promos?|\binstallments? of\b|add .*eligible.*\boff\b|\b-?\d+%\s+now!.*add to cart|flash sale|lightning deal|labou?r day|limited time|special for you|限時(?:優惠|特價|搶購)?|限时(?:优惠|特价|抢购)?|閃購|闪购|領券|领券)/i,
  },
  {
    reason: "gamification",
    pattern: /(?:spin (?:to )?win|轉盤|转盘)/i,
  },
] as const satisfies readonly {
  reason: NeutralizationReason;
  pattern: RegExp;
}[];

const DEEMPHASIS_RULES = [
  {
    reason: "promotion",
    presentation: "neutral-action",
    selectors: [
      '[data-testid*="add-to-cart" i]',
      "._3A7bjOr2._36RgGpaI",
    ],
  },
  {
    reason: "promotion",
    presentation: "neutral-surface",
    selectors: [".DQPvwQBO._3csHYvw1"],
  },
] as const satisfies readonly {
  reason: NeutralizationReason;
  presentation: NeutralizationPresentation;
  selectors: readonly string[];
}[];

const PRIMARY_ACTION_TEXT =
  /^(?:add to cart|加入購物車|加入购物车|add to bag)$/i;
const CART_DESTINATION_TEXT = /^(?:go to cart|前往購物車|前往购物车)$/i;
const PROMOTIONAL_CART_TEXT =
  /(?:^|\s)-?\d+(?:[.,]\d+)?%\s+now!?.*(?:\badd to cart!?|加入購物車!?|加入购物车!?)/i;
const STANDALONE_PROMOTION_HEADING = /^\s*big sale\s*$/i;
const DELIVERY_TEXT =
  /^(?:free shipping for this item|arrives? in .+|ships? earliest .+|此商品免運|此商品免运|預計.+送達|预计.+送达)/i;

const SELECTORS = {
  name: ["._25g_jM0z", '[data-testid="product-title"]', "h1"],
  currentPrice: [
    '[data-testid="current-price"]',
    '[itemprop="price"]',
    '[data-price-type="sale"]',
  ],
  originalPrice: [
    '[data-testid="original-price"]',
    '[data-price-type="original"]',
    "#goods_price del",
    "#goods_price s",
  ],
  discount: [DISCOUNT_SELECTOR, '[data-testid="discount"]'],
  image: [
    '[data-testid="product-image"] img',
    "img[data-main-image]",
    '[itemprop="image"]',
  ],
  description: [
    '[data-testid="product-description"]',
    '[itemprop="description"]',
  ],
  stockAmount: [
    '[data-testid="stock"]',
    '[data-testid="stock-status"]',
    '[data-stock-status]',
    '[aria-label*="stock" i]',
  ],
} as const;

const defaultIdFactory: IdFactory = (element) => {
  const existingId = element?.getAttribute(DEHYPE_ELEMENT_ID);
  if (existingId) return existingId;

  const id = crypto.randomUUID();
  element?.setAttribute(DEHYPE_ELEMENT_ID, id);
  return id;
};

function findFirst(document: Document, selectors: readonly string[]): Element | undefined {
  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element) return element;
  }
  return undefined;
}

function textValue(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

function imageValue(element: Element): string {
  if (element instanceof HTMLImageElement) {
    return (element.currentSrc || element.src || element.getAttribute("src") || "").trim();
  }
  return (element.getAttribute("content") || element.getAttribute("src") || "").trim();
}

function toProductElement(
  element: Element | undefined,
  idFactory: IdFactory,
  readValue: (element: Element) => string = textValue,
): ProductElement | undefined {
  if (!element) return undefined;
  const value = readValue(element);
  return value ? { id: idFactory(element), value } : undefined;
}

function normalizePriceDisplay(rawValue: string): string | undefined {
  const compact = rawValue.replace(/\s+/g, " ").trim();
  const price = compact.match(
    /((?:CA|US|AU|NZ|HK|SG|NT)?[$€£¥₩₹])\s*([0-9][0-9.,'’]*)/i,
  );
  if (!price) return undefined;
  const estimated = /\best\.?\b/i.test(compact);
  return `${estimated ? "Estimated " : ""}${price[1]}${price[2]}`;
}

function toPriceProductElement(
  element: Element | undefined,
  idFactory: IdFactory,
): ProductElement | undefined {
  if (!element) return undefined;
  const row = element.closest("#goods_price > div") ?? element;
  const visualText = Array.from(row.querySelectorAll('[aria-hidden="true"]'))
    .map((child) => child.textContent ?? "")
    .join("");
  const value =
    normalizePriceDisplay(visualText) ??
    normalizePriceDisplay(textValue(element));
  return value ? { id: idFactory(row), value } : undefined;
}

function metadataElement(
  document: Document,
  selector: string,
  idFactory: IdFactory,
): ProductElement | undefined {
  return toProductElement(document.querySelector(selector) ?? undefined, idFactory, (element) =>
    (element.getAttribute("content") ?? "").trim(),
  );
}

function nameFallback(
  document: Document,
  idFactory: IdFactory,
): ProductElement | undefined {
  const metadata = metadataElement(
    document,
    'meta[property="og:title"]',
    idFactory,
  );
  const value = (metadata?.value || document.title)
    .replace(/\s+-\s+Temu(?:\s+[^-]+)?$/i, "")
    .trim();
  return value ? { id: metadata?.id ?? idFactory(), value } : undefined;
}

/** Parse a localized price into decimal major units for ordering only. */
export function parseLocalizedPrice(rawValue: string): number | undefined {
  const numeric = rawValue.match(/[0-9][0-9\s.,'’]*/)?.[0];
  if (!numeric) return undefined;

  const compact = numeric.replace(/[\s'’]/g, "");
  const lastDot = compact.lastIndexOf(".");
  const lastComma = compact.lastIndexOf(",");
  const separatorIndex = Math.max(lastDot, lastComma);
  let normalized: string;

  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = compact.charAt(separatorIndex);
    const grouping = decimal === "." ? "," : ".";
    normalized = compact.replaceAll(grouping, "").replace(decimal, ".");
  } else if (separatorIndex >= 0) {
    const separator = compact.charAt(separatorIndex);
    const groups = compact.split(separator);
    const trailing = groups.at(-1) ?? "";
    const isGrouping =
      trailing.length === 3 &&
      (groups.length > 2 || (groups[0]?.length ?? 0) <= 3);
    normalized = isGrouping
      ? groups.join("")
      : `${groups.slice(0, -1).join("")}.${trailing}`;
  } else {
    normalized = compact;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function genericPriceElements(
  document: Document,
  idFactory: IdFactory,
): ProductElement[] {
  const elements = Array.from(document.querySelectorAll("._14At0Pe5"))
    .filter((element) => !element.closest(DISCOUNT_SELECTOR))
    .filter((element) =>
      /(?:[$€£¥₩₹]|(?:NT|US|CA|AU|HK|SG)\$)\s*\d/i.test(textValue(element)),
    )
    .map((element) => toPriceProductElement(element, idFactory))
    .filter((element): element is ProductElement => {
      return element !== undefined && parseLocalizedPrice(element.value) !== undefined;
    })
    .filter(
      (element, index, elements) =>
        elements.findIndex(
          (candidate) =>
            candidate.id === element.id || candidate.value === element.value,
        ) === index,
    );

  const explicitCurrency = elements
    .map(({ value }) => value.match(/^(?:Estimated )?((?:CA|US|AU|NZ|HK|SG|NT)\$)/i)?.[1])
    .filter((currency): currency is string => currency !== undefined);
  const sharedCurrency = new Set(explicitCurrency).size === 1
    ? explicitCurrency[0]
    : undefined;
  return elements
    .map((element) => ({
      ...element,
      value: sharedCurrency
        ? element.value.replace(/^(Estimated )?\$/, `$1${sharedCurrency}`)
        : element.value,
    }))
    .slice(0, 2);
}

export class TemuProductAdapter implements ProductAdapter {
  public constructor(private readonly idFactory: IdFactory = defaultIdFactory) {}

  public isSupportedPage(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      return (
        url.protocol === "https:" &&
        TEMU_HOSTS.has(url.hostname) &&
        /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?[^/]+-g-\d+\.html$/i.test(url.pathname)
      );
    } catch {
      return false;
    }
  }

  public extractProductInfo(document: Document, pageUrl: string): ProductInfo {
    if (!this.isSupportedPage(pageUrl)) {
      throw new Error("The page is not a supported Temu product page.");
    }

    const name =
      toProductElement(findFirst(document, SELECTORS.name), this.idFactory) ??
      nameFallback(document, this.idFactory);
    if (!name) throw new Error("The Temu product name could not be extracted.");

    let currentPrice = toPriceProductElement(
      findFirst(document, SELECTORS.currentPrice),
      this.idFactory,
    );
    let originalPrice = toPriceProductElement(
      findFirst(document, SELECTORS.originalPrice),
      this.idFactory,
    );

    if (!currentPrice && !originalPrice) {
      const prices = genericPriceElements(document, this.idFactory);
      if (prices.length === 1) {
        currentPrice = prices[0];
      } else if (prices.length === 2) {
        const first = prices[0];
        const second = prices[1];
        if (first && second) {
          const firstValue = parseLocalizedPrice(first.value);
          const secondValue = parseLocalizedPrice(second.value);
          if (firstValue !== undefined && secondValue !== undefined) {
            [originalPrice, currentPrice] =
              firstValue >= secondValue ? [first, second] : [second, first];
          }
        }
      }
    }

    const discount = Array.from(
      document.querySelectorAll(SELECTORS.discount.join(",")),
    )
      .filter((element) => /\d+(?:[.,]\d+)?\s*%/i.test(textValue(element)))
      .map((element) => toProductElement(element, this.idFactory))
      .find((element) => element !== undefined);
    const image =
      toProductElement(
        findFirst(document, SELECTORS.image),
        this.idFactory,
        imageValue,
      ) ??
      metadataElement(document, 'meta[property="og:image"]', this.idFactory);
    const description =
      toProductElement(
        findFirst(document, SELECTORS.description),
        this.idFactory,
      ) ??
      metadataElement(document, 'meta[name="description"]', this.idFactory) ??
      metadataElement(document, 'meta[property="og:description"]', this.idFactory);
    const stockAmount = toProductElement(
      findFirst(document, SELECTORS.stockAmount),
      this.idFactory,
    );

    const productInfo: ProductInfo = { name };
    if (originalPrice) productInfo.originalPrice = originalPrice;
    if (currentPrice) productInfo.currentPrice = currentPrice;
    if (discount) productInfo.discount = discount;
    if (image) productInfo.image = image;
    if (description) productInfo.description = description;
    if (stockAmount) productInfo.stockAmount = stockAmount;
    return productInfo;
  }

  public findNeutralizationTargets(document: Document): NeutralizationTarget[] {
    const targets = new Map<HTMLElement, NeutralizationTarget>();
    const protectedCartDestinations = interactiveElementsWithText(
      document,
      CART_DESTINATION_TEXT,
    );

    for (const rule of SUPPRESSION_RULES) {
      addTargets(
        targets,
        document.querySelectorAll<HTMLElement>(rule.selectors.join(",")),
        "suppress",
        rule.reason,
        "hidden-container",
      );
    }
    for (const rule of TEXT_SUPPRESSION_RULES) {
      const textTargets = elementsWithOwnText(document, rule.pattern);
      addTargets(
        targets,
        rule.reason === "countdown" || rule.reason === "promotion"
          ? textTargets.map((element) =>
              findPromotionalContainer(document, element),
            )
          : textTargets,
        "suppress",
        rule.reason,
        "hidden-container",
      );
    }
    for (const rule of DEEMPHASIS_RULES) {
      addTargets(
        targets,
        document.querySelectorAll<HTMLElement>(rule.selectors.join(",")),
        "deemphasize",
        rule.reason,
        rule.presentation,
      );
    }
    addTargets(
      targets,
      findStandalonePromotionContainers(
        document,
        STANDALONE_PROMOTION_HEADING,
      ),
      "suppress",
      "promotion",
      "hidden-container",
    );
    addTargets(
      targets,
      interactiveElementsWithText(document, PRIMARY_ACTION_TEXT),
      "deemphasize",
      "promotion",
      "neutral-action",
    );
    addTargets(
      targets,
      interactiveElementsWithText(document, DELIVERY_TEXT),
      "deemphasize",
      "promotion",
      "neutral-fact",
    );
    addTargets(
      targets,
      findUpperPromotionalCartCards(document),
      "remove",
      "promotion",
      "removed-container",
    );
    addTargets(
      targets,
      findRedundantPromotionalCartControls(document),
      "suppress",
      "promotion",
      "hidden-container",
    );
    // Choose a surviving commerce control before filtering destructive targets.
    const commerceControls = Array.from(
      document.querySelectorAll<HTMLElement>('button, [role="button"]'),
    ).filter((control) =>
      PRIMARY_ACTION_TEXT.test(textValue(control)) ||
      PROMOTIONAL_CART_TEXT.test(textValue(control)),
    );
    const removalTargets = [...targets.values()].filter(({ action }) => action !== "deemphasize");
    const usableControls = commerceControls.filter(isVisibleUsableControl);
    const retainedControls = usableControls.filter((control) =>
      !removalTargets.some(({ element }) => element.contains(control)) &&
      PRIMARY_ACTION_TEXT.test(textValue(control)),
    );
    if (retainedControls.length === 0) {
      const fallback = usableControls.find((control) =>
        !removalTargets.some(({ element, action }) => action === "remove" && element.contains(control)),
      ) ?? usableControls[0] ?? commerceControls[0];
      if (fallback) retainedControls.push(fallback);
    }
    for (const control of retainedControls) {
      const replacementText = neutralCartText(textValue(control));
      const targetElement = replacementText
        ? promotionalCartTextElement(control)
        : control;
      targets.set(targetElement, {
        element: targetElement,
        action: replacementText ? "rewrite-text" : "deemphasize",
        reason: "promotion",
        presentation: "neutral-action",
        ...(replacementText ? { replacementText } : {}),
      });
    }

    return [...targets.values()].filter(
      ({ element, action }) =>
        !intersectsAny(element, protectedCartDestinations) &&
        (action === "deemphasize" ||
          action === "rewrite-text" ||
          (!element.hasAttribute(DEHYPE_ELEMENT_ID) &&
            !element.querySelector(`[${DEHYPE_ELEMENT_ID}]`) &&
            !intersectsAny(element, retainedControls))),
    );
  }

  public findNeutralLayoutRoot(document: Document): HTMLElement | undefined {
    return (
      document.querySelector<HTMLElement>("#main_scale > .baseContent") ??
      document.querySelector<HTMLElement>('.baseContent[role="main"]') ??
      undefined
    );
  }
}

function addTargets(
  targets: Map<HTMLElement, NeutralizationTarget>,
  elements: Iterable<HTMLElement>,
  action: NeutralizationAction,
  reason: NeutralizationReason,
  presentation: NeutralizationPresentation,
): void {
  for (const element of elements) {
    const existing = targets.get(element);
    if (existing?.action === "suppress") continue;
    targets.set(element, { element, action, reason, presentation });
  }
}

function findPromotionalContainer(
  document: Document,
  element: HTMLElement,
): HTMLElement {
  if (element.closest("#goods_price")) return element;

  const viewWidth = document.defaultView?.innerWidth ?? 0;
  const candidates: HTMLElement[] = [];
  let current: HTMLElement | null = element;
  for (let depth = 0; current && depth < 10; depth += 1) {
    if (
      current.id === "mainHeader" ||
      current.id === "rightContent" ||
      current.hasAttribute(DEHYPE_ELEMENT_ID)
    ) {
      break;
    }
    const bounds = current.getBoundingClientRect();
    const text = textValue(current);
    if (
      bounds.height > 0 &&
      bounds.height <= 120 &&
      text.length <= 700 &&
      !current.querySelector("input, select")
    ) {
      candidates.push(current);
    }
    current = current.parentElement;
  }

  const fullWidthHeader = [...candidates].reverse().find((candidate) => {
    const bounds = candidate.getBoundingClientRect();
    return (
      candidate.closest("#mainHeader") !== null &&
      viewWidth > 0 &&
      bounds.width >= viewWidth * 0.8 &&
      bounds.height <= 80
    );
  });
  return fullWidthHeader ?? candidates.at(-1) ?? element;
}

function elementsWithOwnText(
  document: Document,
  pattern: RegExp,
): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>("span, div, p, strong, em"),
  ).filter((element) => {
    const ownText = Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return ownText.length > 0 && ownText.length <= 180 && pattern.test(ownText);
  });
}

function findStandalonePromotionContainers(
  document: Document,
  pattern: RegExp,
): HTMLElement[] {
  return elementsWithOwnText(document, pattern).map((element) => {
    const label = textValue(element);
    let container = element;
    while (
      container.parentElement &&
      textValue(container.parentElement) === label &&
      !container.parentElement.matches("#rightContent, #mainHeader")
    ) {
      container = container.parentElement;
    }
    return container;
  });
}

function interactiveElementsWithText(
  document: Document,
  pattern: RegExp,
): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ).filter((element) => pattern.test(textValue(element)));
}

function neutralCartText(value: string): string | undefined {
  if (!PROMOTIONAL_CART_TEXT.test(value)) return undefined;
  if (/加入購物車/.test(value)) return "加入購物車";
  if (/加入购物车/.test(value)) return "加入购物车";
  if (/\badd to bag\b/i.test(value)) return "Add to bag";
  if (/\badd to cart\b/i.test(value)) return "Add to cart";
  return undefined;
}

function promotionalCartTextElement(control: HTMLElement): HTMLElement {
  const matchingDescendant = Array.from(
    control.querySelectorAll<HTMLElement>("span, div, p, strong, em"),
  ).find((element) => PROMOTIONAL_CART_TEXT.test(ownText(element)));
  return matchingDescendant ?? control;
}

function ownText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function findRedundantPromotionalCartControls(
  document: Document,
): HTMLElement[] {
  const productPanel = document.querySelector<HTMLElement>("#rightContent");
  if (!productPanel) return [];

  const primaryControls = Array.from(
    productPanel.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ).filter(
    (element) =>
      isVisibleUsableControl(element) &&
      (PRIMARY_ACTION_TEXT.test(textValue(element)) ||
        CART_DESTINATION_TEXT.test(textValue(element))),
  );
  const upperPromotionalCards = new Set(
    findUpperPromotionalCartCards(document),
  );

  return Array.from(
    productPanel.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ).filter((element) => {
    if (
      !isVisibleUsableControl(element) ||
      !PROMOTIONAL_CART_TEXT.test(textValue(element))
    ) {
      return false;
    }

    return primaryControls.some(
      (control) =>
        control !== element &&
        !element.contains(control) &&
        !control.contains(element),
    ) && ![...upperPromotionalCards].some((card) => card.contains(element));
  });
}

function findUpperPromotionalCartCards(document: Document): HTMLElement[] {
  const productPanel = document.querySelector<HTMLElement>("#rightContent");
  if (!productPanel) return [];

  const primaryControls = Array.from(
    productPanel.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ).filter(
    (element) =>
      isVisibleUsableControl(element) && PRIMARY_ACTION_TEXT.test(textValue(element)),
  );
  if (primaryControls.length === 0) return [];

  const cards = new Set<HTMLElement>();
  for (const heading of elementsWithOwnText(
    document,
    STANDALONE_PROMOTION_HEADING,
  )) {
    if (!productPanel.contains(heading)) continue;
    let current: HTMLElement | null = heading;
    let card: HTMLElement | undefined;
    while (current && current !== productPanel) {
      if (
        primaryControls.some((control) => current?.contains(control)) &&
        textValue(current).length <= 700
      ) {
        card = current;
      }
      current = current.parentElement;
    }
    if (card) cards.add(card);
  }
  return [...cards];
}


function intersectsAny(
  element: HTMLElement,
  protectedElements: readonly HTMLElement[],
): boolean {
  return protectedElements.some(
    (protectedElement) =>
      element === protectedElement ||
      element.contains(protectedElement) ||
      protectedElement.contains(element),
  );
}

function isUsableControl(element: HTMLElement): boolean {
  return (
    (!(element instanceof HTMLButtonElement) || !element.disabled) &&
    element.getAttribute("aria-disabled") !== "true"
  );
}

function isVisibleUsableControl(element: HTMLElement): boolean {
  return isUsableControl(element) && isVisiblyRendered(element);
}

function isVisiblyRendered(element: HTMLElement): boolean {
  if (element.hidden || element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  // A target hidden by Dehype must still count as visible for subsequent
  // adapter scans. Otherwise our own `display: none` makes the target vanish
  // from the result, the rebuilder restores it, and the next Temu mutation
  // suppresses it again.
  const dehypeSuppressed =
    element.closest<HTMLElement>("[data-dehype-suppressed]") !== null;

  const view = element.ownerDocument.defaultView;
  for (
    let current: HTMLElement | null = element;
    current;
    current = current.parentElement
  ) {
    const inlineStyle = current.style;
    if (
      inlineStyle.display === "none" ||
      inlineStyle.visibility === "hidden" ||
      inlineStyle.visibility === "collapse" ||
      (inlineStyle.opacity !== "" && Number(inlineStyle.opacity) === 0)
    ) {
      return false;
    }
    const style = dehypeSuppressed ? undefined : view?.getComputedStyle(current);
    if (
      style &&
      (style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        (style.opacity !== "" && Number(style.opacity) === 0))
    ) {
      return false;
    }
  }

  if (!view) return true;

  const bounds = element.getBoundingClientRect();
  if (
    element.getClientRects().length === 0 &&
    bounds.width === 0 &&
    bounds.height === 0
  ) {
    return /\bjsdom\b/i.test(view.navigator.userAgent);
  }
  return true;
}
