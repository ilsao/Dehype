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

The popup stores the selected AI provider, model, and API key in
`chrome.storage.local`. This is intended for personal testing: the key is not
committed to Git, but it is not encrypted and remains accessible to the local
Chrome profile. Use a server-side secret store before distributing the
extension to other users.

The current adapter supports Temu product-detail URLs ending in `-g-<id>.html`.
Product extraction uses the `ProductInfo` contract in
`extension/src/shared/productInfo.ts`. Optional product fields are omitted when
the source page does not provide them, and `ProductElement.id` values remain
local to the extension.

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
|       |-- popup
|       |-- shared
|       `-- sidepanel
|-- scripts
|-- tests
`-- README.md
```
