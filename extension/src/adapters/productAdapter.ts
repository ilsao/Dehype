import type { ProductInfo } from "../shared/productInfo";

export interface ProductAdapter {
  isSupportedPage(url: string): boolean;
  extractProductInfo(document: Document, pageUrl: string): ProductInfo;
}
