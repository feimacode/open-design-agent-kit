## 1. Readers

- [x] 1.1 In-page `readColor` helper in `poster/pageScripts.ts` (`rgb()` fast path, cached 1×1 canvas otherwise, unreadable → undefined)
- [x] 1.2 Use it in `contrast`, the taste rules and every other colour read in `pageScripts.ts`; the contrast walk counts an unreadable background as skipped
- [x] 1.3 Use it in `siteExtraction.ts`, `brandKitCapture.ts`, `brandChecks.ts`, `brandReview.ts`, `beforeAfter.ts` and `figma/captureIr.ts`
- [x] 1.4 Node: `cssColorToHex` and `colorToHex` read `oklch`, `oklab`, `lab`, `lch`, `hwb`, `color(srgb)` and `color(display-p3)`, sharing conversion code with `colorMix.ts`; unit tests against values from Chrome's canvas

## 2. Reporting

- [x] 2.1 Out-of-gamut drafted colours keep their original value in `sources` and as a `draftCss` comment
- [x] 2.2 An extraction note names role colours it couldn't read; check results count skipped colour reads

## 3. Tests and docs

- [x] 3.1 Fixtures: a Tailwind v4 `oklch()` page, a shadcn theme, a `color-mix()` hover and a `display-p3` accent; extraction drafts all roles
- [x] 3.2 Contrast: white text on an `oklch()` button passes; low contrast in `oklch()` is still caught; audit run on the Tailwind v4 fixture
- [x] 3.3 Brand checks and brand review on an own brand whose tokens use `color-mix(in oklab, …)`
- [x] 3.4 CHANGELOG fix line; `docs/reference/tools.md` notes the colour formats read
