import type { ProductInfo } from "./productInfo";

export const DECISION_REPLAY_VERSION = 1;

export type DecisionAction =
  | "PRODUCT_VIEW"
  | "PRODUCT_CLICK"
  | "ADD_TO_CART"
  | "REMOVE_FROM_CART"
  | "CHECKOUT";

export interface ReplayIntent {
  budget?: string;
}

export interface PersuasionRecord {
  elemId: string;
  persuasionType: string;
  strength: "rule-detected";
  originalText: string;
  neutralized: boolean;
}

export interface ProductReplaySnapshot {
  productId: string;
  url: string;
  name: string;
  currentPrice?: string;
  originalPrice?: string;
  viewedAt: number;
  persuasion?: PersuasionRecord[];
}

export interface DecisionEvent {
  id: string;
  timestamp: number;
  action: DecisionAction;
  productId?: string;
  product?: ProductReplaySnapshot;
  elemId?: string;
  leftAt?: number;
  durationMs?: number;
}

export interface DecisionSession {
  version: typeof DECISION_REPLAY_VERSION;
  sessionId: string;
  startedAt: number;
  endedAt?: number;
  intent?: ReplayIntent;
  events: DecisionEvent[];
}

export interface ReplayAnalysisPayload {
  intent?: ReplayIntent;
  products: Array<{
    productId: string;
    name: string;
    currentPrice?: string;
    originalPrice?: string;
    totalViewDurationMs: number;
  }>;
  viewSequence: string[];
  userActions: Array<{
    action: Exclude<DecisionAction, "PRODUCT_VIEW" | "PRODUCT_CLICK">;
    productId?: string;
    timestamp: number;
  }>;
  persuasionRecords: PersuasionRecord[];
}

export function createDecisionSession(now = Date.now()): DecisionSession {
  return {
    version: DECISION_REPLAY_VERSION,
    sessionId: createId("session"),
    startedAt: now,
    events: [],
  };
}

export function createDecisionEvent(
  action: DecisionAction,
  timestamp = Date.now(),
  details: Omit<DecisionEvent, "id" | "action" | "timestamp"> = {},
): DecisionEvent {
  return { id: createId("event"), timestamp, action, ...details };
}

export function productIdFor(
  url: string,
  productInfo: Pick<ProductInfo, "name">,
): string {
  const match = url.match(/(?:^|-)g-(\d+)(?:\.html)?(?:$|[?#])/i);
  if (match?.[1]) return `temu:${match[1]}`;
  return `page:${stableHash(`${url}\n${productInfo.name.value}`)}`;
}

export function productSnapshotFromInfo(
  url: string,
  productInfo: ProductInfo,
  viewedAt = Date.now(),
  persuasion?: PersuasionRecord[],
): ProductReplaySnapshot {
  const snapshot: ProductReplaySnapshot = {
    productId: productIdFor(url, productInfo),
    url,
    name: productInfo.name.value,
    viewedAt,
  };
  for (const [field, key] of [
    ["currentPrice", "currentPrice"],
    ["originalPrice", "originalPrice"],
  ] as const) {
    const value = productInfo[field]?.value;
    if (value) snapshot[key] = value;
  }
  if (persuasion?.length) snapshot.persuasion = persuasion;
  return snapshot;
}

export function buildReplayAnalysisPayload(
  session: DecisionSession,
): ReplayAnalysisPayload {
  const products = new Map<string, ReplayAnalysisPayload["products"][number]>();
  const persuasion = new Map<string, PersuasionRecord>();
  for (const event of session.events) {
    if (event.product) {
      const current = products.get(event.product.productId) ?? {
        productId: event.product.productId,
        name: event.product.name,
        ...(event.product.currentPrice
          ? { currentPrice: event.product.currentPrice }
          : {}),
        ...(event.product.originalPrice
          ? { originalPrice: event.product.originalPrice }
          : {}),
        totalViewDurationMs: 0,
      };
      current.totalViewDurationMs += event.durationMs ?? 0;
      products.set(event.product.productId, current);
      for (const record of event.product.persuasion ?? []) {
        persuasion.set(`${event.product.productId}:${record.elemId}`, record);
      }
    }
  }
  return {
    ...(session.intent ? { intent: session.intent } : {}),
    products: [...products.values()],
    viewSequence: session.events
      .filter((event) => event.action === "PRODUCT_VIEW" && event.productId)
      .map((event) => event.productId as string),
    userActions: session.events
      .filter(
        (event) =>
          event.action === "ADD_TO_CART" ||
          event.action === "REMOVE_FROM_CART" ||
          event.action === "CHECKOUT",
      )
      .map(({ action, productId, timestamp }) => ({
        action: action as Exclude<DecisionAction, "PRODUCT_VIEW" | "PRODUCT_CLICK">,
        ...(productId ? { productId } : {}),
        timestamp,
      })),
    persuasionRecords: [...persuasion.values()],
  };
}

export function isDecisionSession(value: unknown): value is DecisionSession {
  if (!isRecord(value) || value.version !== DECISION_REPLAY_VERSION) return false;
  if (typeof value.sessionId !== "string" || typeof value.startedAt !== "number") {
    return false;
  }
  return Array.isArray(value.events) && value.events.every(isDecisionEvent);
}

export function isDecisionEvent(value: unknown): value is DecisionEvent {
  return isDecisionEventValue(value);
}

function isDecisionEventValue(value: unknown): value is DecisionEvent {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.timestamp === "number" &&
    typeof value.action === "string" &&
    [
      "PRODUCT_VIEW",
      "PRODUCT_CLICK",
      "ADD_TO_CART",
      "REMOVE_FROM_CART",
      "CHECKOUT",
    ].includes(value.action) &&
    (value.productId === undefined || typeof value.productId === "string") &&
    (value.product === undefined || isRecord(value.product))
  );
}

function createId(prefix: string): string {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${randomUuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}