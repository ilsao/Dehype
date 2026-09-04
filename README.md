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
npm run build
```

`npm run build` type-checks the project and creates an unpacked Chrome
extension in `dist/`. To inspect it locally, open `chrome://extensions`, enable
Developer mode, choose **Load unpacked**, and select the generated `dist/`
directory.

Pull requests run lint, test, and build as separate GitHub Actions checks.

# Architecture

```
.
├── AGENTS.md
├── extension
│   ├── img
│   │   └── Dehype.png
│   ├── manifest.json
│   └── src
│       ├── background
│       │   └── serviceWorker.ts
│       ├── content
│       │   └── index.ts
│       ├── popup
│       │   ├── hello.html
│       │   ├── index.html
│       │   └── main.tsx
│       └── sidepanel
│           ├── index.html
│           └── main.tsx
└── README.md
```
