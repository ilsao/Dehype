import type { ProductInfo } from "../shared/productInfo";

export const DEHYPE_ELEMENT_ID = "data-dehype-element-id";

export interface ProductAdapter {
  isSupportedPage(url: string): boolean;
  extractProductInfo(document: Document, pageUrl: string): ProductInfo;
  findSuppressibleElements(document: Document): HTMLElement[];
}
