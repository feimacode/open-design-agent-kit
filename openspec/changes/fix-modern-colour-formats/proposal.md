## Why

Chrome reports a computed colour in the format it was written in. Since Chrome 111, `getComputedStyle` returns `oklch(…)`, `oklab(…)`, `lab(…)`, `lch(…)` and `color(display-p3 …)` / `color(srgb …)` as written, and `color-mix()` resolves to `oklab(…)` or `color(srgb …)`. Only legacy notations (hex, `rgb()`, `hsl()`, names) come back as `rgb()`. Checked in the container's Chromium 153 on 2026-11-04.

Every colour parser in the kit reads only hex and `rgb()`:

- `cssColorToHex` in `generation/evidenceToTokens.ts`, which the site extraction maps every role through;
- the in-page `parseColor` in `poster/pageScripts.ts`, used by `contrast`, the taste rules and the other colour checks of `check_open_design_artifact` and `audit_open_design_site`;
- the page scripts in `export/brandChecks.ts` and `export/brandReview.ts`, and `generation/brandKitCapture.ts`.

`generation/colorMix.ts` already parses `oklch()` and `oklab()`, but nothing in the extraction or the checks calls it.

What this breaks:

- **Extraction.** Tailwind v4 (its default palette since January 2025) and shadcn/ui (since 2025) declare colours in `oklch()`. Found while studying design-extract (2026-11-04): `extractSite` on a local page built like a Tailwind v4 site drafted no `--bg`, `--fg`, `--surface` or `--accent`. It still returned `ok`, with no note.
- **Contrast.** The contrast walk skips a background it can't parse and goes on to the parent, falling back to white. White text on an `oklch()` button is then measured against white (about 1:1) and reported as a failure. This affects audits of Tailwind v4 sites, which business owners read, and the kit's own designs whenever tokens use `color-mix(in oklab, …)`, which the design-system skill suggests for a missing hover. (This effect comes from reading the code; it was not run.)
- **Brand checks and review.** `brand-off-palette`, `brand-fidelity` and the brand kit's component specs ignore such colours in the same way.

## What Changes

- **One colour reader in the page.** A shared page helper turns any CSS colour string into sRGB `{ r, g, b, a }`. Legacy `rgb()` is parsed directly; anything else is painted on a cached 1×1 canvas (`fillStyle`, `fillRect`, `getImageData`), which clips it to sRGB. The helper is used by every page script that reads colours: extraction, checks, audit, brand checks, brand review, brand kit capture, before/after and the Figma capture.
- **One colour reader in Node.** `cssColorToHex` and the `sources` parser `colorToHex` read `oklch()`, `oklab()`, `lab()`, `lch()`, `hwb()`, `color(srgb …)` and `color(display-p3 …)`, gamut-clipped to sRGB, building on `colorMix.ts`.
- **Out of gamut is noted.** When a drafted colour was outside sRGB (a display-p3 or high-chroma `oklch()` value), its source records the original value, and the draft keeps it as a comment in `draftCss`. DESIGN.md can then name the wide-gamut original.
- **No silent failure.** A colour value the tool can't read is counted. When a role element's colour couldn't be read, the extraction adds a note naming the value. A check run that skipped colour reads says so in its result.
- **The contrast walk stops at an unreadable background.** It counts that element as skipped instead of walking on to white.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `design-system-extraction`: colours in any CSS colour format are measured, with wide-gamut originals noted and unread values reported.
- `artifact-visual-check`: colour checks read any CSS colour format, and never measure against a background they couldn't read.

## Impact

- `packages/core/src/poster/pageScripts.ts`: a shared in-page `readColor` helper, used by `contrast` and every colour rule.
- `packages/core/src/generation/siteExtraction.ts`, `brandKitCapture.ts`, `export/brandChecks.ts`, `export/brandReview.ts`, `export/beforeAfter.ts`, `figma/captureIr.ts`: switch to the helper.
- `packages/core/src/generation/evidenceToTokens.ts`, `sourceExtraction.ts`, `colorMix.ts`: Node-side parsing of the modern formats.
- Fixtures: a page using Tailwind v4's `oklch()` palette, a shadcn theme, a `color-mix()` hover, and a `display-p3` accent. Tests cover extraction, contrast (white on an `oklch()` button passes), the audit, the brand checks and `sources`.
- CHANGELOG: a fix line. Systems extracted earlier from such sites have missing colours and can be re-extracted.
