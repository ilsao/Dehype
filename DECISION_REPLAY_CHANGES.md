# Decision Replay MVP

## What changed

- Added an independent `DecisionSession` and `DecisionEvent` domain model.
- Reused `TemuProductAdapter.extractProductInfo()` and existing `ProductInfo` values for product name and prices.
- Derived stable Temu product IDs from the existing `-g-<id>.html` URL convention, with a deterministic URL/name fallback.
- Added content-side tracking for product views, dwell duration, supported commerce actions, variant changes, and route/page lifecycle changes.
- Stored only the supported action types: `PRODUCT_VIEW`, `PRODUCT_CLICK`, `ADD_TO_CART`, `REMOVE_FROM_CART`, and `CHECKOUT`.
- Captured persuasion as page-environment metadata using existing neutralization targets and element IDs. It is not recorded as a user action or causal evidence.
- Added versioned `chrome.storage.local` session persistence with event deduplication and a bounded event count.
- Added a standalone Chrome side panel with timeline, viewed products, total dwell time, intent budget, reset, and optional analysis.
- Added an independent Gemini analysis function that sends a compressed session payload rather than webpage HTML.
- Gemini errors are displayed in the side panel and do not stop replay collection or affect the shopping page.

## Files

New files:

- `extension/src/shared/decisionReplay.ts`
- `extension/src/shared/decisionReplay.test.ts`
- `extension/src/content/decisionReplayRecorder.ts`
- `extension/src/background/decisionReplayStorage.js`
- `extension/src/background/decisionReplayAnalysis.js`
- `extension/src/sidepanel/decisionReplay.html`
- `extension/src/sidepanel/decisionReplay.css`
- `extension/src/sidepanel/decisionReplay.js`

Updated files:

- `extension/src/content/index.ts`
- `extension/src/background/background.js`
- `extension/manifest.json`
- `vite.config.ts`

## Current limitations

- The recorder emits a completed `PRODUCT_VIEW` record when the page/product is left, so an active view is not shown until it ends.
- Product IDs remain based on Temu URL IDs where available; the fallback is stable for the same URL and name, not a globally verified catalog ID.
- Persuasion records use deterministic rule classification and the existing neutralization state; no causal influence score is produced.
- The side panel is intentionally plain and independent from the existing popup.