import type { ProductInfo } from "../shared/productInfo";

export const DEHYPE_ELEMENT_ID = "data-dehype-element-id";

export type NeutralizationAction =
  | "remove"
  | "suppress"
  | "deemphasize"
  | "rewrite-text";
export type NeutralizationReason =
  | "countdown"
  | "scarcity"
  | "social-proof"
  | "promotion"
  | "gamification"
  | "upsell"
  | "recommendation";
export type NeutralizationPresentation =
  | "removed-container"
  | "hidden-container"
  | "neutral-surface"
  | "neutral-action"
  | "neutral-fact";

export interface NeutralizationTarget {
  element: HTMLElement;
  action: NeutralizationAction;
  reason: NeutralizationReason;
  presentation: NeutralizationPresentation;
  replacementText?: string;
}

export interface ProductAdapter {
  isSupportedPage(url: string): boolean;
  extractProductInfo(document: Document, pageUrl: string): ProductInfo;
  findNeutralizationTargets(document: Document): NeutralizationTarget[];
  findNeutralLayoutRoot(document: Document): HTMLElement | undefined;
}
