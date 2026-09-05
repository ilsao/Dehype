import type { ComparableProduct } from "../shared/priceComparison";
import { parsePrice } from "../shared/priceComparison";

const PRODUCT_LINK_SELECTOR = 'a[href*="-g-"][href$=".html"], a[href*="-g-"]';
const SEARCH_PATH = /\/search_result\.html$/i;

export class TemuSearchAdapter {
  public isSearchPage(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      return url.protocol === "https:" &&
        (url.hostname === "temu.com" || url.hostname.endsWith(".temu.com")) &&
        SEARCH_PATH.test(url.pathname);
    } catch {
      return false;
    }
  }

  public buildSearchUrl(keyword: string, currentUrl: string): string {
    const current = new URL(currentUrl);
    const locale = /^\/([a-z]{2}(?:-[a-z]{2})?)\//i.exec(current.pathname)?.[1];
    const pathname = locale ? `/${locale}/search_result.html` : "/search_result.html";
    const searchUrl = new URL(pathname, current.origin);
    searchUrl.searchParams.set("search_key", keyword);
    searchUrl.searchParams.set("search_method", "user");
    return searchUrl.toString();
  }

  public extractProducts(document: Document): ComparableProduct[] {
    const products: ComparableProduct[] = [];
    const seen = new Set<string>();

    for (const link of document.querySelectorAll<HTMLAnchorElement>(PRODUCT_LINK_SELECTOR)) {
      const href = link.href;
      if (!href || seen.has(href)) continue;
      const card = findProductCard(link);
      const text = card.textContent?.replace(/\s+/g, " ").trim() ?? "";
      const price = findPrice(text);
      const name = findName(link, card, price?.priceStr);
      if (!price || !name) continue;
      seen.add(href);
      const productId = extractProductId(href);
      products.push({
        ...price,
        name,
        productUrl: href,
        ...(productId ? { productId } : {}),
      });
    }
    return products;
  }
}

function findProductCard(link: HTMLAnchorElement): HTMLElement {
  const semanticCard = link.closest<HTMLElement>(
    "li, article, [data-testid*='goods' i], [data-testid*='product' i]",
  );
  if (semanticCard) return semanticCard;

  let current: HTMLElement | null = link.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1) {
    const text = current.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length <= 500 && current.querySelector("img")) return current;
    current = current.parentElement;
  }
  return link;
}

function findPrice(text: string) {
  const candidates = text.match(/(?:CA|US|AU|NZ|HK|SG|NT)?\$\s*[\d,]+(?:\.\d+)?\s*(?:CAD|USD|AUD|NZD|HKD|TWD|SGD)?/gi) ?? [];
  for (const candidate of candidates) {
    const parsed = parsePrice(candidate);
    if (parsed) return parsed;
  }
  return undefined;
}

function findName(link: HTMLAnchorElement, card: HTMLElement, price?: string): string {
  const labelled = link.getAttribute("aria-label")?.trim();
  if (labelled) return labelled;
  const heading = card.querySelector("h2, h3, [data-testid*='title' i], [class*='title' i]")?.textContent?.trim();
  if (heading) return heading;
  return (card.textContent ?? "")
    .replace(price ?? "", "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function extractProductId(href: string): string | undefined {
  return /-g-(\d+)(?:\.html)?(?:[?#]|$)/i.exec(href)?.[1];
}