import type { ProductElement, ProductInfo } from "../shared/productInfo";
import {
  DEHYPE_ELEMENT_ID,
  type ProductAdapter,
} from "./productAdapter";

type IdFactory = (element?: Element) => string;

const TEMU_HOSTS = new Set(["temu.com", "www.temu.com"]);
const DISCOUNT_SELECTOR = "._1lS1CJSS.PjdWJn3s";
const SUPPRESSION_SELECTORS = [
  '[data-dehype-persuasion]',
  '[data-testid*="countdown" i]',
  '[data-testid*="coupon" i]',
  '[data-testid*="flash-sale" i]',
  '[data-testid*="lightning" i]',
  '[data-testid*="gamification" i]',
  '[data-testid*="upsell" i]',
  '[data-testid*="recommendation" i]',
  '[aria-label*="countdown" i]',
  '[class*="countdown" i]',
] as const;

const PROMOTION_TEXT =
  /(?:\b(?:flash sale|lightning deal|limited time|special for you|spin (?:to )?win|add .*coupon)\b|限時(?:優惠|特價)?|限时(?:优惠|特价)?|閃購|闪购|倒數|倒计时|領券|领券|轉盤|转盘)/i;

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
    "del",
    "s",
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
  return Array.from(document.querySelectorAll("._14At0Pe5"))
    .filter((element) => !element.closest(DISCOUNT_SELECTOR))
    .filter((element) =>
      /(?:[$€£¥₩₹]|(?:NT|US|CA|AU|HK|SG)\$)\s*\d/i.test(textValue(element)),
    )
    .map((element) => toProductElement(element, idFactory))
    .filter((element): element is ProductElement => {
      return element !== undefined && parseLocalizedPrice(element.value) !== undefined;
    })
    .filter(
      (element, index, elements) =>
        elements.findIndex((candidate) => candidate.value === element.value) === index,
    )
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

    let currentPrice = toProductElement(
      findFirst(document, SELECTORS.currentPrice),
      this.idFactory,
    );
    let originalPrice = toProductElement(
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

  public findSuppressibleElements(document: Document): HTMLElement[] {
    const explicit = Array.from(
      document.querySelectorAll<HTMLElement>(SUPPRESSION_SELECTORS.join(",")),
    );
    const textMatches = Array.from(
      document.querySelectorAll<HTMLElement>("aside, section, div"),
    ).filter((element) => {
      const text = textValue(element);
      return text.length > 0 && text.length <= 300 && PROMOTION_TEXT.test(text);
    });

    const safeCandidates = [...new Set([...explicit, ...textMatches])].filter(
      (element) =>
        !element.hasAttribute(DEHYPE_ELEMENT_ID) &&
        !element.querySelector(`[${DEHYPE_ELEMENT_ID}]`) &&
        !element.matches("button, input, select, [role=button]") &&
        !element.querySelector(
          'button, input, select, [role="button"], [href*="cart" i], [href*="checkout" i]',
        ),
    );

    // Prefer the smallest matching block so a promotional child does not hide
    // an otherwise useful product-details container.
    return safeCandidates.filter(
      (element) =>
        !safeCandidates.some(
          (candidate) => candidate !== element && element.contains(candidate),
        ),
    );
  }
}
