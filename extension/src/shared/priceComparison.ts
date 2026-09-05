export const MAX_RESULTS = 50;

export interface ParsedPrice {
  priceStr: string;
  price: number;
  currency: string;
}

export interface ComparableProduct extends ParsedPrice {
  name: string;
  productId?: string;
  productUrl?: string;
}

export interface PriceSummary {
  min: number;
  max: number;
  median: number;
}

export interface PriceBin {
  lower: number;
  upper: number;
  count: number;
}

export function parsePrice(priceStr: unknown): ParsedPrice | undefined {
  if (typeof priceStr !== "string") return undefined;
  const match = priceStr.trim().match(/^\s*([^\d\s]+)?\s*([\d,]+(?:\.\d+)?)\s*([A-Z]{3})?\s*$/i);
  if (!match?.[2]) return undefined;

  const price = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(price) || price < 0) return undefined;

  const currency = (match[3] ?? currencyFromSymbol(match[1])).toUpperCase();
  if (!currency) return undefined;
  return { priceStr: priceStr.trim(), price, currency };
}

export function selectRandomProducts<T>(
  products: readonly T[],
  maxResults = MAX_RESULTS,
  random = Math.random,
): T[] {
  const selected = [...products];
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [selected[index], selected[swapIndex]] = [selected[swapIndex]!, selected[index]!];
  }
  return selected.slice(0, Math.max(0, maxResults));
}

export function summarizePrices(prices: readonly number[]): PriceSummary | undefined {
  const sorted = prices.filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
  return { min: sorted[0]!, max: sorted[sorted.length - 1]!, median };
}

export function createPriceBins(
  prices: readonly number[],
  requestedBinCount = 6,
): PriceBin[] {
  const values = prices.filter(Number.isFinite);
  if (values.length === 0) return [];
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  if (minimum === maximum) {
    return [{ lower: minimum, upper: maximum, count: values.length }];
  }

  const binCount = Math.max(1, Math.min(requestedBinCount, values.length));
  const width = (maximum - minimum) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    lower: minimum + index * width,
    upper: index === binCount - 1 ? maximum : minimum + (index + 1) * width,
    count: 0,
  }));
  for (const value of values) {
    const index = Math.min(binCount - 1, Math.floor((value - minimum) / width));
    bins[index]!.count += 1;
  }
  return bins;
}

function currencyFromSymbol(symbol: string | undefined): string {
  if (symbol === "$" || symbol === undefined) return "USD";
  if (symbol.toUpperCase() === "CA$") return "CAD";
  if (symbol.toUpperCase() === "AU$") return "AUD";
  if (symbol.toUpperCase() === "NZ$") return "NZD";
  return symbol.toUpperCase();
}