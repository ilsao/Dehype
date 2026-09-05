import {
  createDecisionEvent,
  productSnapshotFromInfo,
  type DecisionAction,
  type DecisionEvent,
  type PersuasionRecord,
} from "../shared/decisionReplay";
import type { ProductInfo } from "../shared/productInfo";
import {
  DEHYPE_ELEMENT_ID,
  type NeutralizationTarget,
  type ProductAdapter,
} from "../adapters/productAdapter";

interface ReplayRecorderOptions {
  document: Document;
  adapter: ProductAdapter;
  sendEvent?: (event: DecisionEvent) => void;
  now?: () => number;
}

interface ActiveView {
  productId: string;
  snapshot: ReturnType<typeof productSnapshotFromInfo>;
  startedAt: number;
}

export class DecisionReplayRecorder {
  private readonly document: Document;
  private readonly adapter: ProductAdapter;
  private readonly sendEvent: (event: DecisionEvent) => void;
  private readonly now: () => number;
  private readonly onClickBound: (event: MouseEvent) => void;
  private readonly onChangeBound: (event: Event) => void;
  private readonly onNavigationBound: () => void;
  private readonly onPageHideBound: () => void;
  private observer: MutationObserver | undefined;
  private refreshTimer: number | undefined;
  private activeView: ActiveView | undefined;
  private currentUrl = "";
  private stopped = false;
  private originalPushState?: History["pushState"];
  private originalReplaceState?: History["replaceState"];

  public constructor(options: ReplayRecorderOptions) {
    this.document = options.document;
    this.adapter = options.adapter;
    this.sendEvent = options.sendEvent ?? ((event) => {
      void globalThis.chrome?.runtime?.sendMessage({
        type: "DEHYPE_REPLAY_APPEND_EVENT",
        event,
      });
    });
    this.now = options.now ?? (() => Date.now());
    this.onClickBound = (event) => this.recordClick(event);
    this.onChangeBound = (event) => this.recordChange(event);
    this.onNavigationBound = () => this.scheduleRefresh();
    this.onPageHideBound = () => this.stop();
  }

  public start(): void {
    if (this.stopped) return;
    this.currentUrl = globalThis.location?.href ?? "";
    this.document.addEventListener("click", this.onClickBound, true);
    this.document.addEventListener("change", this.onChangeBound, true);
    window.addEventListener("popstate", this.onNavigationBound);
    window.addEventListener("hashchange", this.onNavigationBound);
    window.addEventListener("pagehide", this.onPageHideBound);
    this.originalPushState = history.pushState;
    this.originalReplaceState = history.replaceState;
    history.pushState = (...args) => {
      const result = this.originalPushState?.apply(history, args);
      this.onNavigationBound();
      return result;
    };
    history.replaceState = (...args) => {
      const result = this.originalReplaceState?.apply(history, args);
      this.onNavigationBound();
      return result;
    };
    this.observer = new MutationObserver(() => this.scheduleRefresh());
    this.observer.observe(this.document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    this.refresh();
  }

  public stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.observer?.disconnect();
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.document.removeEventListener("click", this.onClickBound, true);
    this.document.removeEventListener("change", this.onChangeBound, true);
    window.removeEventListener("popstate", this.onNavigationBound);
    window.removeEventListener("hashchange", this.onNavigationBound);
    window.removeEventListener("pagehide", this.onPageHideBound);
    if (this.originalPushState) history.pushState = this.originalPushState;
    if (this.originalReplaceState) history.replaceState = this.originalReplaceState;
    this.finishActiveView(this.now());
  }

  public refresh(): void {
    if (this.stopped) return;
    const url = globalThis.location?.href ?? this.currentUrl;
    if (!this.adapter.isSupportedPage(url)) {
      this.finishActiveView(this.now());
      this.currentUrl = url;
      return;
    }
    let productInfo: ProductInfo;
    try {
      productInfo = this.adapter.extractProductInfo(this.document, url);
    } catch {
      return;
    }
    const snapshot = productSnapshotFromInfo(
      url,
      productInfo,
      this.now(),
      this.persuasionRecords(),
    );
    if (this.activeView?.productId === snapshot.productId) {
      this.activeView.snapshot = snapshot;
      this.currentUrl = url;
      return;
    }
    this.finishActiveView(snapshot.viewedAt);
    this.activeView = {
      productId: snapshot.productId,
      snapshot,
      startedAt: snapshot.viewedAt,
    };
    this.currentUrl = url;
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== undefined) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = undefined;
      this.refresh();
    }, 150);
  }

  private finishActiveView(leftAt: number): void {
    const activeView = this.activeView;
    if (!activeView) return;
    this.emit(
      createDecisionEvent("PRODUCT_VIEW", activeView.startedAt, {
        productId: activeView.productId,
        product: activeView.snapshot,
        leftAt,
        durationMs: Math.max(0, leftAt - activeView.startedAt),
      }),
    );
    this.activeView = undefined;
  }

  private recordClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !this.activeView) return;
    const action = actionForElement(target);
    if (!action) return;
    const elemId = elementId(target);
    this.emit(
      createDecisionEvent(action, this.now(), {
        productId: this.activeView.productId,
        ...(elemId ? { elemId } : {}),
      }),
    );
  }

  private recordChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element) || !this.activeView) return;
    const elemId = elementId(target);
    if (!elemId || !isVariantControl(target)) return;
    this.emit(
      createDecisionEvent("PRODUCT_CLICK", this.now(), {
        productId: this.activeView.productId,
        elemId,
      }),
    );
    this.scheduleRefresh();
  }

  private persuasionRecords(): PersuasionRecord[] {
    const targets = this.adapter.findNeutralizationTargets(this.document);
    return targets.map((target) => persuasionRecord(target));
  }

  private emit(event: DecisionEvent): void {
    this.sendEvent(event);
  }
}

function actionForElement(element: Element): DecisionAction | undefined {
  const clickable = element.closest("button, [role=button], a");
  if (!clickable) return undefined;
  const text = (clickable.textContent ?? "").replace(/\s+/g, " ").trim();
  if (/^(?:add to cart|add to bag|加入購物車|加入购物车)$/i.test(text)) {
    return "ADD_TO_CART";
  }
  if (/^(?:remove from cart|移除購物車|移除购物车)$/i.test(text)) {
    return "REMOVE_FROM_CART";
  }
  if (/^(?:checkout|buy now|立即購買|立即购买)$/i.test(text)) return "CHECKOUT";
  return undefined;
}

function isVariantControl(element: Element): boolean {
  return Boolean(
    element.matches(
      'select, input[type="radio"], input[type="checkbox"], [role="radio"], [role="option"]',
    ) || element.closest('[data-testid*="variant" i], [data-variant]'),
  );
}

function elementId(element: Element): string | undefined {
  const existing = element.closest(`[${DEHYPE_ELEMENT_ID}]`);
  if (existing) return existing.getAttribute(DEHYPE_ELEMENT_ID) ?? undefined;
  return undefined;
}

function persuasionRecord(target: NeutralizationTarget): PersuasionRecord {
  const id = elementId(target.element) ?? createLocalElementId(target.element);
  const originalText = (target.element.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return {
    elemId: id,
    persuasionType: target.reason,
    strength: "rule-detected",
    originalText,
    neutralized: Boolean(
      target.element.hasAttribute("data-dehype-suppressed") ||
        target.element.hasAttribute("data-dehype-deemphasized"),
    ),
  };
}

function createLocalElementId(element: Element): string {
  const existing = element.getAttribute(DEHYPE_ELEMENT_ID);
  if (existing) return existing;
  const id = `replay-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
  element.setAttribute(DEHYPE_ELEMENT_ID, id);
  return id;
}