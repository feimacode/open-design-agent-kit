# Tasks: fix-hover-selection-pointer-events

## 1. Diagnose

- [x] User report: selection "only allow select few elements such as buttons"
- [x] Asked a clarifying question to disambiguate "wrong element selected" vs. "nothing selectable at all" — confirmed: nothing lights up until a button
- [x] Root cause: generated artifacts commonly set `pointer-events: none` on most of the page as a loading/entrance-animation lock, lifted by an init script that may not run correctly inside the sandboxed `srcdoc` iframe — leaving only naturally-interactive elements (buttons) receiving hover/click

## 2. Fix

- [x] `updateInspectOverride()` injects `* { pointer-events: auto !important; }` into the iframe's `<head>` while Comment/Edit mode is active, removes it in View mode
- [x] `updatePickCursor()` renamed to `updatePickMode()`, now calls both the cursor update and `updateInspectOverride()` from the same two call sites (mode switch, iframe `load`)

## 3. Verify

- [x] `npm run typecheck`, `npm run lint` — clean
- [x] `rm -rf out out-webview && npm run test:unit` — 41 passing, unchanged
- [x] `rm -rf dist && npm run compile` — clean; confirmed `od-inspect-override`/`pointer-events: auto` present in `dist/webview/main.js`
- [ ] **Not performed**: manual verification in a live Extension Development Host — enter Comment or Edit mode on an artifact where most elements were previously unselectable, confirm hovering now highlights paragraphs/headings/images/divs, not just buttons. Same documented, recurring gap as every prior change in this repo.
