## Context

Deck export (`packages/core/src/export/deck/`) already loads the deck in a headless browser, hides presenter chrome, freezes animation, measures and pins the authored slide size, and shows one slide at a time (`captureDeck.ts`, `pageScripts.ts`). `assemble.ts` then writes one picture per slide with `pptxgenjs`. The archived deck-pptx-pdf-export design named the seam for editable mode: after `pinDeckStage`, replace the screenshot loop.

The starting point is a script Iven's agent wrote on 2026-11-04 (Playwright + python-pptx). It runs a DOM walk inside the page, collecting backgrounds, boxes, images, text runs, SVG rects, paths and text, and notes. It then places native objects at the measured positions. Its in-page part is plain browser JavaScript and ports as is. Its Python part maps one-to-one onto pptxgenjs calls.

## Goals / Non-Goals

**Goals:** an editable `.pptx` from any deck the picture export handles; text that can be edited, close to the deck's layout; no visual element silently lost; no new runtime or dependency; works in every host, including the hosted gateway.

**Non-Goals:** pixel-perfect output (the picture export does that); native tables, charts or SmartArt; SVG to editable shapes; embedding fonts; animations; writing into a customer `.potx` (kept possible, see D2); editable PPTX from non-deck pages.

## Decisions

### D1. Read the layout in the browser, in our own code

`readSlideScene(stageSelector, slideIndex)` is a new page script, following the existing rules: self-contained, with helpers nested inside it, and covered by the "no free identifiers" test. It walks the active slide and returns positions relative to the pinned stage in CSS px. Starting from the script, it:

- collects text per block element with its inline runs. It uses a Range to get the text's own box, so flex-centred text lands where the browser drew it. It records the line count (box height ÷ line height) to choose wrap vs no-wrap;
- turns a solid fill, a uniform border, or one to four side borders into boxes. The script handled the left border only; we handle all four as thin rectangles;
- records `<img>` (with the `object-fit: contain`/`cover` box) and `url()` background images;
- records the slide's own solid background;
- applies `text-transform` itself, because PowerPoint has no equivalent.

**Why not vendor `dom-to-pptx` 2.0.1** (upstream's choice): it is about 1 MB gzipped, injects a large bundle into the user's page, and hasn't been tried on our decks. The script has, and it is a few hundred lines we fully control. We can add upstream's ideas (CJK font handling) when we need them.

### D2. A plain slide scene between reading and writing

`slideScene.ts` defines `SlideScene { background, plate?, boxes[], pictures[], texts[], notes, flattened[] }` in CSS px. `assembleEditable.ts` turns scenes into PowerPoint with pptxgenjs, converting px to inches by the stage width (13.333 in ÷ stage width, the same layout rule as `assemblePptx`). Font sizes in pt are px × 72 × 13.333 ÷ stage width, which generalizes the script's fixed 0.6 for a 1600 px stage.

Keeping the scene separate means a later writer can put the same scenes into a customer's `.potx` (open the package with `jszip`, add slides on its master). pptxgenjs can't open an existing template, so that writer will be separate code. The brand thread already reads `.potx` themes in `generation/templateExtraction.ts`.

### D3. A background picture catches what we can't express

Once native objects are recorded, the page script hides them in place:
- text colour becomes transparent;
- the backgrounds and borders of boxes we turned into shapes become transparent;
- recorded images get `visibility: hidden`.

We then screenshot the slide. What remains is everything PowerPoint can't express: gradients, shadows, `::before`/`::after` decoration, SVG, canvas, filters, transformed or semi-transparent elements, and noise textures. That image goes in as the bottom picture. If it is one uniform colour (the existing blank-slide test), we drop it and use a solid background. `restoreSceneObjects` undoes the changes before the next slide.

Elements we never turn into native objects are always left to the background picture. That covers elements with a transform other than a translation, a filter, `clip-path` or a mask, `mix-blend-mode` or gradient text, and their whole subtree. Text inside them is listed as flattened. This stops a rotated label from becoming a straight, misplaced text box.

Changed while building it: `opacity < 1` was first on that list, but decks use it for muted text everywhere, and flattening it put most of a slide's text on the picture. Opacity is now carried down as transparency, and faded text over a solid colour is written as the solid colour it looks like (easier to edit, and LibreOffice clips transparent text to its box). A native shape painted below a flattened element and overlapping it is also left on the picture, since it would otherwise cover it. Outside list markers become PowerPoint bullets and numbers rather than staying on the picture.

**Why:** the script only looked right on Iven's deck because of hard-coded fixes (a red frame bar drawn by hand). The background picture makes every deck look right without per-deck rules, and keeps all text that can be edited editable.

### D4. SVG stays a picture in v1

The script's SVG handling turned `<path>` into a straight line from its first point to its last, which is wrong for curves, arrows and Mermaid edges. In v1, a whole `<svg>` goes on the background picture (D3) and is listed as flattened, along with its text. Editable diagram shapes are a later change; Mermaid and the kit's diagram runtime could give structured nodes and edges for that.

### D5. Text boxes and fonts

We keep the script's rules, which worked:
- single-line text gets no wrap and a box widened by 12% + 8 px, anchored by its alignment, because PowerPoint's font measurements often run wider than the browser's;
- multi-line text keeps the block's content width and wraps;
- margins are zero and the anchor is the top;
- line spacing is set exactly from the CSS line height;
- `font-weight ≥ 600` is bold.

The font name is the first family in the computed stack, so the user's own font choice survives. Generic monospace stacks map to Consolas. The report lists every font used, and marks the ones loaded with `@font-face` or from Google Fonts: PowerPoint shows a substitute when they aren't installed. Fonts aren't embedded, because pptxgenjs can't, and embedding has licence issues.

### D6. Opt-in, its own file name, same arguments

`editable: true` is valid only with `format: "pptx"`, and otherwise fails clearly. It works with `slides` and `width`/`height`. `scale` only affects the background picture and image screenshots, default 2. The file is `exportFilePathWithSuffix(entry, 'editable', undefined, 'pptx')` → `<entry>-editable.pptx`. The manifest's `exports` list doesn't change (`pptx` is already there). The hosted gateway already runs `pptx` as a slow job; `editable` passes through.

### D7. Report and text coverage

The result adds `editable: { slides: [{ number, texts, boxes, pictures, flattened: string[] }], fonts: [{ name, webFont }] }` and a short summary line. Coverage rule: every non-empty visible text node on the slide is either in a text box or listed as flattened, with the reason (svg, canvas, transformed…). The tests check this; at runtime, a gap becomes a warning that names the slide.

### D8. Canva prefers the editable file

Canva's "import from URL" turns a picture-only PPTX into pictures. The instructions export decks with `editable: true`, and use the picture export if the editable one fails, saying so to the user.

## Risks / Trade-offs

- **Text reflow in PowerPoint** → single lines don't wrap; multi-line boxes keep the browser's width. Wrapping can still differ by a word when fonts are substituted. The report names the fonts.
- **The background picture hides an editing surprise**: decoration can't be moved, only replaced. This is acceptable and matches what Iven's script did for diagrams; the report says what is on it.
- **Odd deck markup** (absolute layouts, CSS columns, `display: contents`) → the smoke test runs every vendored deck example; anything unmeasurable falls to the background picture rather than being lost.
- **Bigger files** → one background picture per slide at scale 2; uniform plates are dropped; `scale: 1` is offered when over 50 MB, as today.
- **Page script complexity** → one self-contained function, unit tested on fixture HTML in the browser tests (skipped without a browser), like the existing scripts.

## Migration Plan

Additive. Picture export, PDF and image export are unchanged. No manifest migration.

## Open Questions

- Should the editable export become the default for `format: "pptx"` once it has been used for a while? This change keeps the picture export as the default.
- Native tables (`<table>` → pptxgenjs `addTable`) are the most likely next step. Wait for a request.
