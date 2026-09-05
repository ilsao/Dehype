import type { Elem, ProductInfo } from "../shared/productInfo";
import type { ProductAdapter } from "./productAdapter";

type IdFactory = () => string;

type FieldName =
  | "name"
  | "discount";

const TEMU_HOSTS = new Set(["temu.com", "www.temu.com"]);
const DISCOUNT_SELECTOR = "._1lS1CJSS.PjdWJn3s";

const FIELD_SELECTORS: Record<FieldName, string[]> = {
  name: ["._25g_jM0z"],
  discount: [DISCOUNT_SELECTOR],
};

const defaultIdFactory: IdFactory = () => crypto.randomUUID();

function findElement(document: Document, fieldName: FieldName): Element | undefined {
  for (const selector of FIELD_SELECTORS[fieldName]) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }

  return undefined;
}

function readElementValue(element: Element): string {
  return (element.textContent || "").trim();
}

function toElem(
  element: Element | undefined,
  idFactory: IdFactory,
): Elem | undefined {
  if (!element) {
    return undefined;
  }

  return {
    id: idFactory(),
    value: readElementValue(element),
  };
}

function toNameFallback(document: Document, idFactory: IdFactory): Elem | undefined {
  const metadataName = document.querySelector('meta[property="og:title"]')?.getAttribute(
    "content",
  );
  const value = (metadataName || document.title)
    .replace(/\s+-\s+Temu(?:\s+[^-]+)?$/i, "")
    .trim();

  return value ? { id: idFactory(), value } : undefined;
}

function parsePriceValue(price: Elem): number | undefined {
  const numericPart = price.value.match(/\d+(?:,\d{3})*(?:\.\d+)?/);
  if (!numericPart) {
    return undefined;
  }

  const value = Number(numericPart[0].replace(/,/g, ""));
  return Number.isFinite(value) ? value : undefined;
}

export class TemuProductAdapter implements ProductAdapter {
  private readonly idFactory: IdFactory;

  public constructor(idFactory: IdFactory = defaultIdFactory) {
    this.idFactory = idFactory;
  }

  public isSupportedPage(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return (
        TEMU_HOSTS.has(parsedUrl.hostname) &&
        /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?[^/]+-g-\d+\.html$/i.test(
          parsedUrl.pathname,
        )
      );
    } catch {
      return false;
    }
  }

  public getName(document: Document): Elem | undefined {
    return (
      toElem(findElement(document, "name"), this.idFactory) ||
      toNameFallback(document, this.idFactory)
    );
  }

  private getPriceElements(document: Document): Elem[] {
    return Array.from(document.querySelectorAll("._14At0Pe5"))
      .filter((element) => /\$\s*\d/.test(readElementValue(element)))
      .slice(0, 2)
      .map((element) => toElem(element, this.idFactory))
      .filter((element): element is Elem => element !== undefined);
  }

  public getDiscount(document: Document): Elem | undefined {
    const discountElement = Array.from(
      document.querySelectorAll(DISCOUNT_SELECTOR),
    ).find((element) => /\b\d+(?:\.\d+)?%\s*OFF\b/i.test(element.textContent));

    return toElem(discountElement, this.idFactory);
  }

  public extractProductInfo(document: Document, pageUrl: string): ProductInfo {
    if (!this.isSupportedPage(pageUrl)) {
      throw new Error("The page is not a supported Temu product page.");
    }

    const nameElement = this.getName(document);
    if (!nameElement || nameElement.value.length === 0) {
      throw new Error("The Temu product name could not be extracted.");
    }

    const priceElements = this.getPriceElements(document);
    let originalPriceElement: Elem | undefined;
    let currentPriceElement: Elem | undefined;

    if (priceElements.length === 1) {
      currentPriceElement = priceElements[0];
    } else if (priceElements.length >= 2) {
      const [firstPrice, secondPrice] = priceElements;
      if (firstPrice && secondPrice) {
        const firstValue = parsePriceValue(firstPrice);
        const secondValue = parsePriceValue(secondPrice);

        if (firstValue === undefined || secondValue === undefined) {
          currentPriceElement = firstPrice;
        } else if (firstValue >= secondValue) {
          originalPriceElement = firstPrice;
          currentPriceElement = secondPrice;
        } else {
          originalPriceElement = secondPrice;
          currentPriceElement = firstPrice;
        }
      }
    }
    const discountElement = this.getDiscount(document);

    const productInfo: ProductInfo = {
      name: nameElement,
    };

    if (originalPriceElement) productInfo.originalPrice = originalPriceElement;
    if (currentPriceElement) productInfo.currentPrice = currentPriceElement;
    if (discountElement) productInfo.discount = discountElement;

    return productInfo;
  }
}
