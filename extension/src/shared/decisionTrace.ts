import { parseLocalizedPrice } from "../adapters/temuProductAdapter";
import type {
  DecisionEvent,
  DecisionSession,
  PersuasionRecord,
  ProductReplaySnapshot,
} from "./decisionReplay";

export interface DecisionTraceProduct {
  productId: string;
  name?: string;
  currentPrice?: string;
  originalPrice?: string;
  discount?: string;
  stockAmount?: string;
  totalViewDurationMs: number;
  attentionShare: number;
  viewCount: number;
  firstViewedAt?: number;
  lastViewedAt?: number;
  addedToCart: boolean;
  removedFromCart: boolean;
  persuasionSignals: string[];
}

export interface PersuasionSignalSummary {
  persuasionType: string;
  count: number;
  productIds: string[];
}

export interface BudgetAlignment {
  budget: number;
  finalPrice?: number;
  difference?: number;
  status: "within-budget" | "over-budget" | "unknown";
}

export interface DecisionTrace {
  products: DecisionTraceProduct[];
  sequence: string[];
  totalDecisionTimeMs: number;
  comparisonCount: number;
  revisitCount: number;
  finalProductId?: string;
  finalPrice?: number;
  budgetAlignment?: BudgetAlignment;
  persuasionSignals: PersuasionSignalSummary[];
  intent?: { budget?: number };
}

export function buildDecisionTrace(session: DecisionSession): DecisionTrace {
  const productMap = new Map<string, DecisionTraceProduct>();
  const sequence: string[] = [];
  const persuasionMap = new Map<string, PersuasionSignalSummary>();
  let totalDecisionTimeMs = 0;

  for (const event of session.events) {
    const productId = event.productId ?? event.product?.productId;
    const product = event.product;
    if (event.action === "PRODUCT_VIEW" && productId) {
      if (sequence.at(-1) !== productId) sequence.push(productId);
      const current = getOrCreateProduct(productMap, productId, product);
      const duration = completedDuration(event);
      current.totalViewDurationMs += duration;
      current.viewCount += 1;
      current.firstViewedAt ??= event.timestamp;
      current.lastViewedAt = Math.max(current.lastViewedAt ?? event.timestamp, event.timestamp);
      totalDecisionTimeMs += duration;
      addPersuasionSignals(current, persuasionMap, productId, product?.persuasion);
    }

    if (event.action === "ADD_TO_CART" || event.action === "REMOVE_FROM_CART") {
      if (productId) {
        const current = getOrCreateProduct(productMap, productId, product);
        if (event.action === "ADD_TO_CART") current.addedToCart = true;
        if (event.action === "REMOVE_FROM_CART") current.removedFromCart = true;
        addPersuasionSignals(current, persuasionMap, productId, product?.persuasion);
      }
    }
  }

  const finalProductId = findFinalProductId(session.events);
  const finalProduct = finalProductId ? productMap.get(finalProductId) : undefined;
  const finalPrice = finalProduct?.currentPrice
    ? parseLocalizedPrice(finalProduct.currentPrice)
    : undefined;
  const budget = session.intent?.budget
    ? parseLocalizedPrice(session.intent.budget)
    : undefined;
  const trace: DecisionTrace = {
    products: [...productMap.values()].map((product) => ({
      ...product,
      attentionShare:
        totalDecisionTimeMs > 0
          ? product.totalViewDurationMs / totalDecisionTimeMs
          : 0,
    })),
    sequence,
    totalDecisionTimeMs,
    comparisonCount: countComparisons(sequence),
    revisitCount: countRevisits(sequence),
    ...(finalProductId ? { finalProductId } : {}),
    ...(finalPrice !== undefined ? { finalPrice } : {}),
    persuasionSignals: [...persuasionMap.values()],
    ...(budget !== undefined ? { intent: { budget } } : {}),
  };
  if (budget !== undefined) {
    if (finalPrice === undefined) {
      trace.budgetAlignment = { budget, status: "unknown" };
    } else {
      const difference = Math.round((budget - finalPrice) * 100) / 100;
      trace.budgetAlignment = {
        budget,
        finalPrice,
        difference,
        status: finalPrice <= budget ? "within-budget" : "over-budget",
      };
    }
  }
  return trace;
}

function getOrCreateProduct(
  products: Map<string, DecisionTraceProduct>,
  productId: string,
  snapshot?: ProductReplaySnapshot,
): DecisionTraceProduct {
  const existing = products.get(productId);
  if (existing) {
    enrichProduct(existing, snapshot);
    return existing;
  }
  const created: DecisionTraceProduct = {
    productId,
    ...(snapshot?.name ? { name: snapshot.name } : {}),
    ...(snapshot?.currentPrice ? { currentPrice: snapshot.currentPrice } : {}),
    ...(snapshot?.originalPrice ? { originalPrice: snapshot.originalPrice } : {}),
    ...(snapshot?.discount ? { discount: snapshot.discount } : {}),
    ...(snapshot?.stockAmount ? { stockAmount: snapshot.stockAmount } : {}),
    totalViewDurationMs: 0,
    attentionShare: 0,
    viewCount: 0,
    addedToCart: false,
    removedFromCart: false,
    persuasionSignals: [],
  };
  products.set(productId, created);
  return created;
}

function enrichProduct(product: DecisionTraceProduct, snapshot?: ProductReplaySnapshot): void {
  if (!snapshot) return;
  if (product.name === undefined && snapshot.name) product.name = snapshot.name;
  if (product.currentPrice === undefined && snapshot.currentPrice) {
    product.currentPrice = snapshot.currentPrice;
  }
  if (product.originalPrice === undefined && snapshot.originalPrice) {
    product.originalPrice = snapshot.originalPrice;
  }
  if (product.discount === undefined && snapshot.discount) product.discount = snapshot.discount;
  if (product.stockAmount === undefined && snapshot.stockAmount) {
    product.stockAmount = snapshot.stockAmount;
  }
}

function addPersuasionSignals(
  product: DecisionTraceProduct,
  summaries: Map<string, PersuasionSignalSummary>,
  productId: string,
  records?: PersuasionRecord[],
): void {
  for (const record of records ?? []) {
    if (!product.persuasionSignals.includes(record.persuasionType)) {
      product.persuasionSignals.push(record.persuasionType);
    }
    const summary = summaries.get(record.persuasionType) ?? {
      persuasionType: record.persuasionType,
      count: 0,
      productIds: [],
    };
    summary.count += 1;
    if (!summary.productIds.includes(productId)) summary.productIds.push(productId);
    summaries.set(record.persuasionType, summary);
  }
}

function completedDuration(event: DecisionEvent): number {
  return event.durationMs !== undefined && event.durationMs >= 0
    ? event.durationMs
    : 0;
}

function countComparisons(sequence: string[]): number {
  return sequence.slice(1).filter((productId, index) => productId !== sequence[index]).length;
}

function countRevisits(sequence: string[]): number {
  const seen = new Set<string>();
  let revisits = 0;
  for (const productId of sequence) {
    if (seen.has(productId)) revisits += 1;
    seen.add(productId);
  }
  return revisits;
}

function findFinalProductId(events: DecisionEvent[]): string | undefined {
  const add = [...events].reverse().find((event) => event.action === "ADD_TO_CART" && event.productId);
  if (add?.productId) return add.productId;
  const checkout = [...events].reverse().find((event) => event.action === "CHECKOUT" && event.productId);
  return checkout?.productId;
}