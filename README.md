# Dehype

Dehype is an early Chrome Manifest V3 extension that helps people reconsider
impulsive shopping decisions. The current repository is an initial skeleton;
the product features described in `AGENTS.md` are not all implemented yet.

## Development

Node.js 22.13+ (and lower than Node.js 23) and npm are required.

```sh
npm ci
npm run lint
npm test
npm run typecheck
npm run build
```

`npm run build` type-checks the project and creates an unpacked Chrome
extension in `dist/`. To inspect it locally, open `chrome://extensions`, enable
Developer mode, choose **Load unpacked**, and select the generated `dist/`
directory.

The side panel offers consent-based analysis through OpenAI, Gemini, or Claude. If
AI is not configured or cannot return a valid result, Dehype preserves the
original product facts and still applies deterministic structural cleanup to
the active Temu page. Provider, model, consent, and API-key settings are
versioned in `chrome.storage.local`; the key is not encrypted and remains
accessible to the local Chrome profile.

The current adapter supports Temu product-detail URLs ending in `-g-<id>.html`.
Product extraction uses the `ProductInfo` contract in
`extension/src/shared/productInfo.ts`. Optional product fields are omitted when
the source page does not provide them, and `ProductElement.id` values remain
local to the extension. The manual Neutralize action waits briefly for dynamic
product data, inserts neutral inline replacements for visible extracted fields,
and temporarily hides known promotional elements. The source nodes remain in
place so either the side-panel Restore action or the on-page Restore control can remove all
extension-owned changes without destroying Temu event handlers. If no visible
field can be rebuilt, the action reports an error instead of presenting the
analysis as a successful page update. If a Temu tab predates an extension
reload, the side panel uses the narrowly scoped `scripting` permission to inject the
built content script into that active tab and retry the action once.

Pull requests run lint, test, and build as separate GitHub Actions checks.

## Architecture

```text
.
|-- AGENTS.md
|-- extension
|   |-- img
|   |   `-- Dehype.png
|   |-- manifest.json
|   `-- src
|       |-- adapters
|       |-- background
|       |-- content
|       |-- shared
|       `-- sidepanel
|-- scripts
|-- tests
`-- README.md
```
