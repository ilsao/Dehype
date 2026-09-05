# User Need Side Panel Design

## Goal

Add a Chrome Side Panel interface that lets a user enter, edit, save, and reset shopping needs. The same page shows a live, organized preview below the form. This feature does not call an AI provider or participate in product neutralization yet.

## Data Model

```ts
interface UserNeed {
  minBudget: number | null;
  maxBudget: number | null;
  mustHave: string[];
  niceToHave: string[];
  exclude: string[];
}
```

The value is stored under the `userNeed` key in `chrome.storage.local`. Empty budget inputs are represented by `null`. List inputs use one item per line; blank lines and surrounding whitespace are removed before saving or previewing.

## Interface

The Side Panel is a single scrolling page with two full-width sections:

1. An editor containing adjacent minimum and maximum budget inputs, followed by text areas for must-have, nice-to-have, and excluded requirements.
2. A live summary below the editor showing the normalized values currently in the form.

Save validates and persists the current form. Reset clears browser storage and returns the form and preview to their empty state. A status region reports loading, save, reset, and validation outcomes without blocking editing.

## Validation

Budget values are optional. Entered values must be finite non-negative numbers. When both are present, the minimum cannot exceed the maximum. Validation failures do not overwrite the last saved value.

## Browser Integration

`extension/manifest.json` declares the Chrome `sidePanel` permission and points `side_panel.default_path` at `src/sidepanel/index.html`. The existing Vite input already includes this HTML entry, so it will emit the executable JavaScript and CSS while preserving the manifest's runtime path.

## Boundaries

- No AI API calls.
- No ProductInfo or neutralization changes.
- No API key access.
- No automatic persistence while typing; only Save changes storage.
- Live preview reflects unsaved form content and is clearly labelled as a preview.

## Testing

Unit tests cover normalization, budget validation, storage load/save, and reset with a mocked storage area. Verification also includes TypeScript type-checking, ESLint, the full Vitest suite, and a production Vite build.
