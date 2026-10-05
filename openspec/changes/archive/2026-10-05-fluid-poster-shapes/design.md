## Context

`poster-format-pipeline` (archived 2026-10-05) added a canvas-format catalog, a Canvas section in briefs, print PDFs, preflight, bulk export, QR codes and `adapt_open_design_artifact`. Every design there is **fixed**: the `[data-od-card]` is authored at one exact size, and print cards include their bleed. Changing shape means a new generation through `adapt_open_design_artifact`.

An experiment (scratchpad `shape/poster.html` and `sheet.png`) authored the Hack Night poster with sizes in container query units, the card size in two CSS variables, and one `@container (aspect-ratio > 1.2)` rule. Changing only the variables rendered acceptable results at all print portrait shapes (1:1.29–1:1.55), Instagram 4:5, square and 16:9. 9:16 Story was usable but weak, which motivates a "tall" rule. Constraints carried over: tools never write design content (the shape switcher and export only change the rendered page), there are no new dependencies, and page scripts stay self-contained.

## Goals / Non-Goals

**Goals:**
- Pick or change a fluid poster's shape at export, in the preview or in chat, instantly and deterministically, with no regeneration.
- One source file per poster; per-shape tuning lives in it as layout rules.
- Bleed and print size handled at export for fluid designs.
- Fixed designs (social-card recipes, upstream templates, remixed examples) keep working exactly as now.

**Non-Goals:**
- Converting existing fixed designs to fluid automatically. `adapt_open_design_artifact` stays the route for those.
- Smart photo cropping beyond an author-set focus point (`object-position`).
- A free-positioning canvas editor; the switcher only resizes.
- Changing the social-post workflow's fixed recipes.

## Decisions

### D1. The fluid contract is declared in the HTML

A fluid design marks its card `<div data-od-card data-od-fluid>`. The attribute in the HTML is the source of truth; registration mirrors it into `metadata.fluid` for listing, but export and preflight read the attribute in the page. The contract, taught by the Canvas section:

```css
[data-od-card] {
  --od-w: 297mm; --od-h: 420mm;   /* the default shape, set by the author */
  --od-bleed: 0mm;                /* set by export for print; 0 in the preview */
  width: calc(var(--od-w) + 2 * var(--od-bleed));
  height: calc(var(--od-h) + 2 * var(--od-bleed));
  container-type: size; position: relative; overflow: hidden; box-sizing: border-box;
}
.od-safe { position: absolute; inset: calc(var(--od-bleed) + max(48px, 6cqmin)); }  /* content lives here; 48px covers every screen safe margin */
@container (aspect-ratio > 1.2) { … wide layout … }
@container (aspect-ratio < 0.6) { … tall layout … }
```

- Sizes inside the card are in `cqw`/`cqh`/`cqmin`, or in `%`, `em` or `fr`. Fixed `px`/`mm`/`pt` are allowed only for hairlines (≤ 2 px borders and rules).
- Photos say what matters with `object-position` (for example `30% 20%`), so a face survives a wide crop.
- Secondary elements a small or extreme shape should drop carry `data-od-priority="2"`/`"3"`. Layout rules hide them (`display: none`) inside the wide or tall rule. This carries over the content-priority list from adaptation.

*Alternatives considered:* (a) Infer fluidity by scanning the CSS for container units. Rejected: fragile, and an explicit opt-in tells tools which route applies. (b) Scale a fixed design with `transform`. Rejected: that is plain scaling, which the experiment showed is only right within one aspect ratio, and it breaks bleed.

### D2. When briefs are fluid

`prepare_open_design_brief` gains `fluid?: boolean`. The default is `true` for print formats and `false` for screen formats, because social recipes need exact pixels and hand-tuned type. The poster workflow always passes `fluid: true`, including for Instagram and Story. With `fluid`, `composeCanvasSection` emits the fluid variant: the contract above, the default shape as the `--od-w`/`--od-h` values, the three layout bands (default, wide `> 1.2`, tall `< 0.6`), the priority and focus conventions, and "author at trim size; export adds bleed". Without it, today's fixed section is unchanged. `fluid: true` with no `format` is allowed: the default shape is A3, and the brief says the shape can change later.

### D3. Applying a shape is one page script

`applyShape(cardSelector, { widthCss, heightCss, bleedCss })` sets the three variables on the card's inline style. It returns the measured card box and whether the card is fluid, and waits two animation frames for layout. Export calls it right after load, before preflight, for:
- a fluid card plus a `preset`;
- a fluid card plus a recorded `metadata.format`;
- each entry of `presets`.

Screen shapes set `--od-w`/`--od-h` in px with bleed 0. Print shapes set them in mm with `--od-bleed` set to the format's bleed (or `bleed`). The viewport is sized as today (from the bleed box), so `isolateCardForPrint` and print PDF work unchanged. A fixed card is never resized: export behaves as today and preflight reports `card-size`/`bleed-size` with the hint "this design is fixed-size; use adapt_open_design_artifact for other shapes". Export still proceeds, as today.

*Alternative:* write a resized copy of the HTML per shape. Rejected because it multiplies source files, which is the problem this change removes.

### D4. Size resolution for fluid designs

The order stays explicit → preset/recorded → skill hint → element → default. The only difference is that for a fluid card, step 2 *produces* the shape instead of assuming the card already has it. Explicit `width`/`height` on a fluid design sets `--od-w`/`--od-h` in px, so any custom size works too.

### D5. Several shapes and the shape sheet

`presets: string[]` (1–15) loops over the shapes in one browser session: apply shape, preflight, capture, repeat. It can't be combined with `preset`, `width` or `height`. Files are named `<base>-<formatId>.<ext>` (images) or `<base>-<formatId>.pdf` (print), and with `data`, `<base>-<rowSuffix>-<formatId>`. Print shapes in the list produce PDFs and screen shapes PNGs, unless `format` forces one type for all.

`shapeSheet: true`:
- Captures each shape as a PNG at a thumbnail scale and composes them in the same browser on a neutral page, as in the experiment: a fixed row height, a label per shape, and a red or green dot for that shape's preflight errors.
- Writes `exports/<base>-shapes.png`.
- With no `presets`, it covers every catalog format.
- It can be combined with `checkOnly` (the sheet is then the only file written; the manifest isn't touched).
- The result lists findings grouped by shape.

### D6. The `fixed-size` check

For fluid cards only: after preflight at the export shape, apply the same shape at 1.5× its width and height, re-measure `font-size` and box widths for text elements and `img`/`svg`, then restore. Elements whose size changed by less than 1.05× (fixed sizes grow exactly 1×, while relative sizes with a `max(…)` floor still grow partly and must not be flagged) are reported as `fixed-size` warnings ("doesn't scale with the poster — size it in cq units"). Hairline borders aren't measured. This is behavioral, so it doesn't depend on how the CSS was written (variables, `calc`, inline styles).

### D7. Default shape and the VS Code switcher

For fluid designs, `metadata.format` means the default shape. The preview webview receives `fluid` and `defaultFormat` in its `init` message. The toolbar shows a **Shape** dropdown (catalog formats, default first). Choosing one sets the variables on the card in the webview's document and scales the stage to fit the panel. Nothing is written.
- **Check this shape** posts `check-shape`. The provider runs the core export with `checkOnly`, preset set to that shape and the configured browser, then returns findings shown as a count with an expandable list. That reuses export, so the CLI, MCP and the preview agree.
- **Use as default shape** posts `set-default-shape`. The provider writes `metadata.format` through the manifest writer (a manifest, not design content).

The dropdown is hidden for fixed designs. Fixed designs show "Fixed size — ask the agent to adapt it for other shapes" in its place.

### D8. Adaptation for fluid masters

`adapt_open_design_artifact` on a fluid master returns one adaptation entry per requested shape, with `mode: "tune"`. Its instructions:
- render nothing new;
- say to apply the shape in the preview or with `export … checkOnly: true, preset: <id>`;
- tell the agent to fix the problems found by adding or adjusting `@container` rules in the master for that shape's aspect range, without breaking the other shapes;
- say to re-check the other shapes with `shapeSheet: true, checkOnly: true`.

No new file, no new collection entry. Fixed masters keep today's behavior (`mode: "new-file"`). The tool's description says which applies.

### D9. Workflow

`poster.md` becomes:
1. Medium and default shape (ask only print vs screen, plus the size if the user cares; otherwise A3 or Instagram portrait).
2. Generate with `fluid: true`.
3. QR code.
4. Register.
5. Check at the default shape.
6. Show the shape sheet when the user wants other sizes, or before the final export of a print piece.
7. Export with `preset` or `presets`; tune with adaptation only for shapes that fail.
8. Report.

## Risks / Trade-offs

- [Models write weaker fluid CSS than fixed CSS] → The Canvas section gives a concrete skeleton (D1). The `fixed-size` check catches mixed units. The shape sheet makes problems visible before export. If quality turns out poor, `fluid: false` stays available.
- [Container queries in print] → Chrome supports container queries in print and in the PDF path, as the experiment already used them. A print-specific test renders a fluid card to PDF and checks its geometry.
- [One file accumulating many `@container` rules] → Guidance limits rules to aspect bands rather than per-format rules. Three bands cover the catalog.
- [cq-sized type below the minimum at small shapes] → Preflight `min-type` already runs at the exported shape. The Canvas section suggests `max(…pt, …cqmin)` for body text.
- [Webview switcher drifting from the export render] → Both apply the same variables. "Check this shape" uses the real export, and the dropdown is a preview only.
- [`presets` × `data` × print producing many files] → Cap the total outputs per call at 400 and fail early with a message to split.

## Migration Plan

Additive. Existing fixed designs and existing `format` usage behave identically. New fluid designs come from the poster workflow. The poster docs and the `poster.md` prompt change. Rollback is reverting the change, after which fluid designs would export at their default shape only.

## Open Questions

- Should the Instagram/Story rows of the social-post workflow also become fluid when they use `poster-hero`? This change keeps them fixed, so revisit after seeing how good fluid generations are.
- The shape sheet's default set (all 15 formats) may be noisy for a print-only user. An alternative default is "the design's medium only". Starting with all, because it's the "see everything at once" moment.
