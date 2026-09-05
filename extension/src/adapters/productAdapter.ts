import type { ProductInfo } from "../shared/productInfo";

export const DEHYPE_ELEMENT_ID = "data-dehype-element-id";

export type NeutralizationAction = "suppress" | "deemphasize";
export type NeutralizationReason =
  | "countdown"
  | "scarcity"
  | "social-proof"
  | "promotion"
  | "gamification"
  | "upsell"
  | "recommendation";
export type NeutralizationPresentation =
  | "hidden-container"
  | "neutral-surface"
  | "neutral-action"
  | "neutral-fact";

export interface NeutralizationTarget {
  element: HTMLElement;
  action: NeutralizationAction;
  reason: NeutralizationReason;
  presentation: NeutralizationPresentation;
}

export interface ProductAdapter {
  isSupportedPage(url: string): boolean;
  extractProductInfo(document: Document, pageUrl: string): ProductInfo;
  findNeutralizationTargets(document: Document): NeutralizationTarget[];
  findNeutralLayoutRoot(document: Document): HTMLElement | undefined;
}
