# Bug fix: hover/selection only worked on buttons

## Why

The user reported that hover/selection highlighting (added the previous round) only worked on a few elements like buttons — hovering most of the page showed nothing at all, confirmed via a clarifying question that ruled out "wrong element selected" in favor of "nothing lights up until a button."

Root cause: many AI-generated artifacts set `pointer-events: none` on most of the page as part of a loading/entrance-animation state (a common pattern with GSAP/IntersectionObserver-driven reveal effects), only lifted once a "ready"/init script runs. That script may never fire correctly inside this extension's sandboxed `srcdoc` iframe — the same general class of issue as the ninth round's "navigation not working" bug, just manifesting as inert `mouseover`/`click` targeting instead of dead nav buttons this time. Native `<button>` elements still register because they typically sit outside the animated/locked container (e.g. a persistent header) or because real interactive controls are more often deliberately excluded from such loading-state CSS — so only they kept receiving hover/click events, matching the exact reported symptom.

## What Changes

- `src/webview/main.ts`: new `updateInspectOverride()` injects a `<style id="od-inspect-override">* { pointer-events: auto !important; }</style>` into the iframe's `<head>` whenever Comment or Edit mode is active, forcing every element to be hit-testable for hover/click regardless of the artifact's own live interactivity CSS. The style is removed in View mode, so the artifact still renders and behaves exactly as a real visitor would see it there.
- `updatePickCursor()` renamed to `updatePickMode()` and now also calls `updateInspectOverride()`, keeping both mode-driven iframe-document side effects (cursor + pointer-events override) in one place, called from the same two sites (mode switch, iframe `load`).

## Impact

- Modified: `src/webview/main.ts`.
- No spec delta — this is a bug fix restoring the already-documented hover/selection requirement (from the twenty-first round) to actually work across all elements, not a new capability.
