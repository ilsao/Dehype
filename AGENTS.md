# Dehype Engineering Guide

This file applies to the entire repository. It is both the product north star and the engineering contract for every contributor and coding agent working on Dehype.

## Product Mission

Dehype is a local-first Chrome extension that helps people notice and reconsider impulsive shopping decisions. The MVP targets Temu product pages and rebuilds them into a neutral, decision-oriented view.

Dehype is advisory. It must help users make their own decisions without blocking a purchase, shaming the user, or presenting an estimated influence as scientifically proven causation. Use calm, neutral language throughout the product.

## Current Repository State

The repository currently contains an early Chrome Manifest V3 skeleton under `extension/` and the shared Sprint 1 product contract in `extension/src/shared/productInfo.ts`. Empty entry points and missing build configuration are not implemented features. Treat the architecture below as the intended direction and introduce infrastructure incrementally as features require it.

Do not describe future-phase functionality as available until it is implemented and tested.

## MVP Scope and Priorities

Implement the MVP in this order:

1. Let the user manually open a Neutral Rebuild from the extension side panel.
2. Extract the current Temu product, price, selected variant, and decision-relevant details.
3. Compare the current choice with relevant products or variants available within the current Temu context.
4. Capture the user's original purchase intent: budget, use case, required conditions, and excluded conditions.
5. Calculate an explainable Decision Delta and estimated influence indicators.

The MVP supports Temu only. Keep site-specific behavior behind an adapter boundary so additional retailers can be added later without changing shared decision logic.

### Explicitly Out of Scope for the MVP

- Cross-retailer or cross-site comparison
- Search-engine shopping results
- External price-comparison APIs
- Direct scraping of other retailers
- Automatic purchase prevention or checkout interception
- Fully implemented Causal Decision Replay
- Fully implemented Personalized Decision Defense or Decision Fingerprint modeling
- Claims that a page element caused a user's decision

Interfaces may reserve space for replay events and personalized influence weights, but do not build speculative pipelines or user interfaces for them during the MVP.

## Product Principles

- **Preserve user agency.** Never prevent checkout, add friction that cannot be dismissed, or make a decision on the user's behalf.
- **Explain every judgment.** Scores and warnings must include concise, human-readable reasons based on observable data.
- **Separate facts from estimates.** Product facts, requirement mismatches, and estimated influence must be visually and semantically distinguishable.
- **Prefer deterministic behavior.** Core extraction, normalization, matching, and scoring must work without an LLM.
- **Fail safely.** Missing or uncertain information must be shown as unknown, never invented or silently treated as a match.
- **Stay reversible.** Users must be able to return to the original page at any time without a reload or loss of their selected variant when technically possible.

## Intended Architecture

### Content Script

The content script is responsible for observing supported Temu pages, extracting structured product data, detecting persuasion elements, and mounting or unmounting the neutral experience. It must not contain scoring policy or persistence policy.

Use `MutationObserver` only where dynamic page changes require it. Scope observers narrowly, debounce repeated work, and disconnect observers when the feature is inactive or the page changes.

### Temu Site Adapter

All Temu selectors, DOM traversal, localized-label interpretation, and variant extraction belong in a Temu adapter. Shared code consumes normalized domain objects and must not query Temu DOM selectors directly.

### Background Service Worker

The Manifest V3 service worker coordinates sessions, message routing, lifecycle events, and storage access that should not live in the page. It must remain restart-safe: never rely on in-memory state being preserved between events.

### Side Panel

The side panel is the primary control surface for:

- Creating and editing the purchase intent
- Reviewing the current product and same-site comparisons
- Reviewing Decision Delta reasons
- Manually activating or closing Neutral Rebuild
- Resetting the current shopping session

Do not activate Neutral Rebuild automatically in the MVP.

### Neutral Rebuild

Render extension-controlled UI in an isolated root, preferably Shadow DOM. Do not irreversibly overwrite or delete the source DOM. If the original page must be hidden, use reversible state and restore prior styles and attributes when neutral mode closes.

The neutral view must preserve:

- Product identity and primary image
- Selected variant and its price
- Essential specifications
- Shipping cost and delivery estimate when available
- Seller information when available
- Review rating, count, and a clearly labeled review summary when available
- Requirement matches, mismatches, and unknowns

The neutral view should suppress or de-emphasize:

- Countdown timers and expiring-offer urgency
- Scarcity and low-stock claims
- Popularity, trending, and best-seller badges
- Gamified rewards, spins, coupons, and progress mechanics
- Upsells, upgrade prompts, bundles, and unrelated recommendations
- Animated or visually dominant urgency treatments

Never silently add an item to the cart, change a variant, apply a coupon, start checkout, or purchase anything. Always provide an obvious, keyboard-accessible control that restores the original page.

### Persistence

Use `chrome.storage.local` by default. Version all persisted records and validate them when reading. Treat malformed or incompatible stored data as recoverable: preserve what can be validated, otherwise reset only the affected record and explain the recovery to the user when it affects visible state.

Do not introduce IndexedDB until storage size or query requirements demonstrate that `chrome.storage.local` is insufficient.

## Decision Delta Rules

Decision Delta is an explainable estimate of how far the current choice has moved from the user's stated intent. It should combine:

- Budget variance: whether and by how much the selected price exceeds the stated budget
- Requirement mismatch: required conditions that fail or cannot be verified
- Newly introduced wants: preferences that appeared during browsing but were not part of the baseline
- Purpose drift: evidence that the selected product serves a materially different use case

Keep scoring in small, pure functions. Every non-zero contribution must produce a `DecisionDeltaReason` with a summary and evidence. The UI must show the reasons alongside the score. A score is not a diagnosis, moral judgment, or causal measurement.

Do not infer purpose drift or newly introduced wants solely from the presence of a persuasion element. If evidence is insufficient, mark the result unknown or omit the contribution.

## Estimated Influence Rules

Estimated Influence indicates that a persuasion pattern may have affected the shopping context. It does not establish that the pattern caused the user's behavior.

- Label results with language such as "estimated influence" or "possible influence."
- Preserve the detected evidence and classification confidence.
- Never use wording such as "this caused you to" or "proof that you were manipulated."
- Allow deterministic rules to produce a useful result when no model is available.
- Keep model confidence separate from the estimated strength of an influence.

## LLM and Model Policy

LLM use is optional and must not be required for core MVP operation.

- Obtain explicit user consent before sending any page or intent data off-device.
- Minimize and redact payloads before transmission.
- Validate model output against a versioned JSON Schema.
- Reject invalid output and fall back to deterministic rules.
- Do not include raw page HTML, browsing history, authentication data, or checkout data.
- Never embed provider secrets or API keys in extension code.
- Make model-derived content visibly distinguishable when uncertainty matters.

## Privacy and Safety

Dehype is local-first. Purchase intent, product observations, browsing events, session data, and future fingerprint data must remain on the device unless the user explicitly consents to a clearly described transfer.

Never collect or persist:

- Payment card or bank information
- Passwords, cookies, tokens, or authentication fields
- Full addresses or checkout-form contents
- Unrelated browsing history
- Page data outside the minimum needed for the active Dehype feature

Request the narrowest Chrome permissions possible. Host permissions must be limited to supported Temu origins for the MVP. Any new permission requires a documented feature need and a privacy review.

Logging must exclude sensitive page content and user-entered intent by default. Development diagnostics must be removable or disabled in production builds.

## Messaging and State Conventions

- Define extension messages as a discriminated TypeScript union.
- Validate messages at every trust boundary, including content-script messages.
- Keep one owner for each state transition; avoid duplicating session state across the page, side panel, and worker.
- Persist state before acknowledging operations whose loss would surprise the user.
- Handle service-worker restart, tab navigation, unsupported pages, and stale product information explicitly.
- Include schema versions in persisted state and externally generated structured data.

## Coding Conventions

- Enable TypeScript strict mode; do not use `any` to bypass domain modeling.
- Prefer small pure functions for normalization, matching, scoring, and neutral-model generation.
- Keep DOM access inside site adapters and rendering modules.
- Keep Chrome API calls behind narrow wrappers that can be replaced in tests.
- Use exhaustive checks for discriminated unions.
- Treat `Elem.value` as untrusted raw text at trust boundaries.
- Normalize price and locale data from `originalPrice.value` and `currentPrice.value` before comparison; never compare formatted price strings.
- Represent missing information explicitly instead of fabricating defaults.
- Write code comments and JSDoc in English.
- Use accessible semantic HTML, visible focus states, sufficient contrast, and keyboard-operable controls.
- Respect reduced-motion preferences and do not recreate urgency through the extension's own visuals.
- Avoid hidden network calls, telemetry, analytics, and new runtime dependencies unless the feature explicitly requires them.
- Never commit secrets, user data, generated browsing captures, or production page dumps.

## Testing Requirements

### Unit Tests

Cover at minimum:

- Purchase-intent validation and persisted-schema validation
- `ProductInfo` required-name behavior, optional-field handling, and `Elem` string constraints
- Localized price parsing and minor-unit normalization
- Required and excluded condition matching
- Decision Delta components, bounds, explanations, and unknown states
- Persuasion classification rules and confidence bounds
- Neutral-page model generation
- Restoration-state bookkeeping

### Temu Fixture Tests

Use sanitized, minimal DOM fixtures. Test:

- Missing optional `ProductInfo` fields, including prices, discount, image, description, and stock amount
- Selected variants and price changes
- Localized currencies and number formats
- Dynamically inserted persuasion elements
- Duplicate or conflicting fields
- Minor DOM changes and selector fallbacks
- Unsupported and non-product pages

Do not commit fixtures containing personal data, session tokens, or full copied production pages.

### Integration Tests

Test the complete manual flow:

1. Enter and save an intent.
2. Open a supported Temu product page.
3. Extract the selected product and same-site candidates.
4. Display Decision Delta reasons and unknowns.
5. Activate Neutral Rebuild from the side panel.
6. Confirm blocked persuasion content is absent while essential decision information remains.
7. Restore the original page and preserve the user's selection where possible.

Also verify session reset, local persistence, malformed-data recovery, offline and extraction-error states, keyboard navigation, and service-worker restart behavior. Tests must confirm that Dehype does not add to cart, modify checkout, change variants, or trigger purchases.

## Definition of Done

A change is complete only when:

- The behavior is within the MVP scope or is clearly isolated as future-facing infrastructure.
- New decision logic has deterministic tests and human-readable output.
- Temu-specific code remains behind the adapter boundary.
- Privacy and permission impact has been considered.
- Loading, empty, unknown, error, and restoration states are handled.
- User-facing influence language is explicitly non-causal.
- Type checking, automated tests, and extension manifest validation pass.
- Documentation reflects user-visible behavior and does not claim unfinished features.

If the repository does not yet provide a command for one of these checks, add the relevant tooling as part of the feature that first needs it; do not claim the check passed when no check exists.

## Future Phases

After the MVP is stable, Dehype may add:

- **Causal Decision Replay:** a chronological record of page stimuli and subsequent user actions, presented as possible turning points rather than proven causes.
- **Personalized Decision Defense:** local accumulation of observed response patterns and a Decision Fingerprint used to adjust reminder intensity.

Future work must preserve the same local-first, explainable, consent-based rules. Historical correlation must never be described as individual causal proof.
