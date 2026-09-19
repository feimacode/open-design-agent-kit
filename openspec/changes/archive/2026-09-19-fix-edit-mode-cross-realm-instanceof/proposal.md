# Bug fix: Edit mode never opened, for any artifact

## Why

The user reported the Edit button doesn't work, for both freshly generated artifacts and remixed examples — i.e. every artifact, not something specific to one kind. Root cause: `src/webview/main.ts`'s `onIframeClick` gated the Edit-mode branch on `target instanceof HTMLElement`, where `target` is `event.target` from a click inside the preview `<iframe>`'s own document — a separate JavaScript realm from the outer webview script that runs this check. Each frame/window has its own independent set of built-in constructors (`HTMLElement`, `Array`, etc.); an element created in the iframe's realm is not `instanceof` the *parent* frame's `HTMLElement`, even though both documents are same-origin and `iframe.contentDocument` is fully readable/writable. This is a well-known cross-frame `instanceof` pitfall, distinct from same-origin access restrictions (which the sandbox's `allow-same-origin` already correctly handles) — `instanceof` is a language-level identity check against a specific realm's prototype object, not an access-control check.

The practical effect: the check silently evaluated to `false` for every click, on every artifact, so `openEditPanel()` was simply never called — Comment mode (which has no such check) worked, but Edit mode appeared completely inert.

## What Changes

- `src/webview/main.ts`: removed the `instanceof HTMLElement` runtime check; `openEditPanel(target as HTMLElement, id)` uses a plain type assertion instead. This is correct because a real click event's `target` is always an `Element` (browsers report the nearest element for clicks, never a bare text node), so the check was never protecting against a real case — only breaking the real case.
- Audited the rest of the webview client code (`elementTargeting.ts`, `sourcePatches.ts`, `commentOverlay.ts`) for the same pattern — this was the only `instanceof` check in any webview file. `getComputedStyle()` and `getBoundingClientRect()` calls elsewhere on iframe-realm elements are unaffected (native render-tree queries, not prototype-identity checks), so no other fix was needed.

## Impact

- Modified: `src/webview/main.ts`.
- No spec delta — this restores the already-documented Edit-mode behavior (`Live Artifact Preview Editor` requirement), which was never actually reachable due to this bug.
