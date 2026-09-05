import type { ProductInfo } from "../shared/productInfo";
import { TemuProductAdapter } from "../adapters/temuProductAdapter";

const productAdapter = new TemuProductAdapter();

export function extractCurrentProduct(
	document: Document,
	pageUrl: string = window.location.href,
): ProductInfo | undefined {
	if (!productAdapter.isSupportedPage(pageUrl)) {
		return undefined;
	}

	return productAdapter.extractProductInfo(document, pageUrl);
}

type ExtractionStatus = "complete" | "retry" | "unsupported";

function tryReportCurrentProduct(): ExtractionStatus {
	if (!productAdapter.isSupportedPage(window.location.href)) {
		console.info("[Dehype] waiting for a supported product page", window.location.href);
		return "unsupported";
	}

	try {
		const productInfo = extractCurrentProduct(document);
		if (!productInfo) {
			console.warn("[Dehype] no product was extracted", window.location.href);
			return "retry";
		}

		console.info("[Dehype] ProductInfo extracted", productInfo);
		return "complete";
	} catch (error) {
		console.error("[Dehype] ProductInfo extraction failed", error);
		return "retry";
	}
}

export function onExecute(): void {
	console.info("[Dehype] content script loaded", window.location.href);
	let extractionObserver: MutationObserver | undefined;

	const startExtraction = (): void => {
		extractionObserver?.disconnect();
		const status = tryReportCurrentProduct();
		if (status !== "retry") {
			return;
		}

		extractionObserver = new MutationObserver(() => {
			const nextStatus = tryReportCurrentProduct();
			if (nextStatus !== "retry") {
				extractionObserver?.disconnect();
			}
		});
		extractionObserver.observe(document.documentElement, {
			childList: true,
			subtree: true,
		});
	};

	let lastUrl = window.location.href;
	startExtraction();
	window.setInterval(() => {
		if (window.location.href === lastUrl) {
			return;
		}

		lastUrl = window.location.href;
		console.info("[Dehype] URL changed", lastUrl);
		startExtraction();
	}, 500);
}
