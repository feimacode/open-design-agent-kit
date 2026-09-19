# Tasks: fix-edit-mode-cross-realm-instanceof

## 1. Diagnose

- [x] User report: Edit button doesn't work, for both generated artifacts and remixed examples (i.e. not artifact-specific)
- [x] Found the root cause by grepping the webview code for `instanceof` — exactly one match, in the Edit-mode branch of `onIframeClick`
- [x] Confirmed the mechanism: `target` is `event.target` from a click inside the iframe's own document (a separate JS realm); `target instanceof HTMLElement`, checked against the *parent* frame's `HTMLElement` constructor, always evaluates false for an element from a different realm — this is independent of the sandbox's `allow-same-origin` (which grants access, not shared prototypes)
- [x] Confirmed Comment mode has no equivalent check and was unaffected, matching the user's report being specific to Edit mode
- [x] Audited `elementTargeting.ts`, `sourcePatches.ts`, `commentOverlay.ts` for the same pattern — none found; `getComputedStyle`/`getBoundingClientRect` calls elsewhere are native render-tree queries, not prototype-identity checks, so unaffected by the realm boundary

## 2. Fix

- [x] `main.ts`: removed the `instanceof HTMLElement` runtime check, replaced with a plain `as HTMLElement` type assertion (safe: a real click's `event.target` is always an Element, never a bare text node)

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed `instanceof HTMLElement` no longer present in `dist/webview/main.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — open an artifact, switch to Edit mode, click an element, confirm the edit panel opens and Apply writes back to the file. Same documented, recurring gap as every prior change in this repo.
