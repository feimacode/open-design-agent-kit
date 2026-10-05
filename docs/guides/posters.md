# Posters and print

Design a poster or flyer once, check it, and export it at any size: a PDF a print shop can use, or images for social media. Change the size whenever you like without regenerating it, or make one copy per row of a spreadsheet: name cards, certificates, speaker cards.

## Before you start

- An installed Chrome, Edge or Chromium, for checking and exporting ([why](export-images.md#before-you-start)).

## Start

> **In VS Code:** `/open-design-poster An A3 poster for our hackathon, with a QR code to the signup page`

> **In Claude Code / Codex:** just ask ("make an A2 poster for the meetup"). The `open-design-poster` skill loads by itself for poster, flyer and print requests. You can also invoke it explicitly: `/open-design:open-design-poster` (plugin) or `/open-design-poster` (`init`) in Claude Code, or the `open-design-poster` skill in Codex.

If you don't say whether it's for print or screens, the agent asks first. You don't need to know the final size yet. The agent starts from the size you name, or A3 for print and Instagram portrait for screens, and you can change it later: see [Change the shape](#change-the-shape).

## Formats

| For | Format id | Size |
|---|---|---|
| Flyer, handout | `a4`, `letter` | 210×297 mm, 8.5×11 in |
| Notice-board poster | `a3`, `tabloid` | 297×420 mm, 11×17 in |
| Wall poster | `a2`, `a1`, `poster-18x24`, `poster-24x36` | 420×594 mm, 594×841 mm, 18×24 in, 24×36 in |
| Conference or research poster | `a0` | 841×1189 mm |
| Instagram, Stories, X, square | `ig-portrait`, `story`, `x-image`, `ig-square` | 1080×1350, 1080×1920, 1600×900, 1080×1080 px |
| YouTube thumbnail, Xiaohongshu card | `yt-thumbnail`, `xhs-card` | 1280×720, 1080×1440 px |

Every id, with its safe area, bleed and minimum type size, is in [Canvas formats](../reference/tools.md#canvas-formats).

## How it works

1. **Generate.** The agent passes a default shape as `format`, with `fluid: true`, to [`prepare_open_design_brief`](../reference/tools.md#prepare_open_design_brief). Its instructions get a **Canvas** section: one `[data-od-card data-od-fluid]` element whose size is two CSS variables, everything inside sized relative to the poster, and layout rules for wide and tall shapes. The poster [reflows to any shape](#change-the-shape).
2. **QR code.** If the poster needs one, [`create_open_design_qr_code`](../reference/tools.md#create_open_design_qr_code) generates a real one, offline, into the artifact's `assets/` folder.
3. **Register** with the same `format`. It's recorded in the manifest as the default shape, [`metadata.format`](../reference/artifact-manifest.md#metadataformat).
4. **Check.** [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) with `checkOnly: true` runs the [preflight checks](#preflight-checks) without writing anything, and the agent fixes every error.
5. **Export** with `preset` set to the size you want, or `presets` for several.

## Print-ready PDFs

A print shop trims a poster after printing, so the artwork has to run a little past the cut line (the **bleed**: 3 mm on ISO sizes, 0.125 in on US sizes) and the text has to stay a little inside it (the **safe area**). For a print format:

- A fluid poster is built at the trim size; export adds the bleed by growing the card and moving the content in. (A fixed-size poster is built at the trim size plus the bleed: an A3 card is 303×426 mm.)
- The PDF page is that bleed size, with vector text. Its **TrimBox** marks the cut and its **BleedBox** the full artwork, which is what print shops' software reads.
- `cropMarks: true` adds crop marks at the corners, in a 10 mm margin around the page. Ask your printer whether they want them; many don't.
- `bleed: 0` exports at the trim size, for printing at home or the office.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/hack-night/hack-night.html --preset a3 --crop-marks` ([options](../reference/cli.md#export)).

**Color:** the PDF is RGB. Most print shops convert it to CMYK themselves. If yours insists on CMYK or PDF/X, convert it with their recommended tool first. Very saturated screen colors (neon green, electric blue) print duller.

## Preflight checks

Every image or page-PDF export checks the design before capturing it, and lists what it found, errors first. Findings never stop the export; `checkOnly: true` runs the checks alone.

| Check | Finds |
|---|---|
| `overflow` | Text that is longer than its box and gets cut off, or runs past the edge of the card |
| `safe-area` | Text, images or a QR code outside the safe area; for print, anything inside the bleed that will be cut off |
| `bleed-size`, `card-size` | A card that isn't the format's size (for print: trim plus bleed) |
| `min-type` | Text below the format's minimum size (print, in points) or under 14 px on a 1080 px social canvas |
| `contrast` | Text with too little contrast against a solid background (4.5:1, or 3:1 for large text). Text on gradients or photos is listed as not checked |
| `emoji` | Emoji, which [can come out as empty boxes](../troubleshooting.md#emoji-show-as-empty-boxes) |
| `image-ppi` | Print only: photos below 150 ppi at their printed size (an error below 100 ppi) |
| `qr` | A QR code that doesn't decode to the text it's labelled with, or can't be decoded at all |
| `overlap` | Text drawn over other text, typically a long value from a spreadsheet running into the next line |
| `fixed-size` | Fluid posters only: text or images that didn't grow when the poster was rendered 1.5× larger, because they're sized in `px` or `mm` |
| `broken-asset` | An image, font or stylesheet that failed to load |

## Change the shape

Posters from this workflow are **fluid**: one file that reflows to every shape in the [format list](#formats), print and social. Changing the size changes two CSS variables in the rendered page, so it's instant, needs no AI and never changes the file. Wide shapes (X, YouTube) and tall ones (Story) use the poster's own layout rules for those shapes.

- **Pick it at export.** `preset: "poster-24x36"` exports that size; `presets: ["a3", "ig-portrait", "story"]` exports several at once (up to 15), named `hack-night-a3.pdf`, `hack-night-ig-portrait.png` and so on. Print shapes come out as PDFs and screen shapes as PNGs. Each shape is checked at its own size. A custom size works too: `width` and `height` in pixels.
- **See every shape at once.** `shapeSheet: true` makes `exports/hack-night-shapes.png`: the poster at every size (or only the `presets` you list), with a red dot on any size that has preflight errors. Add `checkOnly: true` to write nothing else.
- **Look at it, not just the dots.** Preflight catches text that's cut off, overlapping or too small, but it can't judge composition. A shape can pass every check and still look wrong, for example a headline crammed into a corner with empty space below. The shape sheet is where you see that.
- **Fix a shape that looks wrong.** Ask the agent. [`adapt_open_design_artifact`](../reference/tools.md#adapt_open_design_artifact) gives it instructions to **tune** that shape inside the same file, through the layout rule for wide or tall shapes, then re-check the others. No new files are made.
- **Change the default.** The size used when none is given is [`metadata.format`](../reference/artifact-manifest.md#metadataformat). An export with no `preset` uses it, as a print PDF for a print size (add `format: "png"` for an image), and checks run at it. It survives the agent re-registering the poster after an edit.

> **In VS Code:** the preview of a fluid poster has a **Shape** dropdown that shows it at any size (nothing is saved), **Check** to run preflight at that size, and **Use as default** to make it the default. The poster is shown as a page on a gray canvas. **Zoom** is **Fit** (the whole page, scaled to the panel) or a fixed 25–100%, where 100% is the poster's size in CSS pixels. Sizes with the same proportions, like A4 to A0, look the same at Fit; what differs is the printed size, so use **Check** to see whether type and photos still hold up. A fixed-size design shows "Fixed size" in its place.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/hack-night/hack-night.html --presets a3,ig-portrait,story` or `--shape-sheet --check`.

### Fixed-size designs

Designs from the social-post recipes, remixed examples and anything without `data-od-fluid` have one fixed size. Exporting one at a different `preset` still runs, but preflight reports a `card-size` (or `bleed-size`) error saying the design is fixed-size. `presets` and `shapeSheet` are refused.

For these designs, [`adapt_open_design_artifact`](../reference/tools.md#adapt_open_design_artifact) **re-composes** the design for each new size: the same message and design system, laid out again rather than shrunk, written next to the original (`launch-story.html`). The original and its versions form one [collection](generate-a-design.md#collections).

## One per row from a spreadsheet

For name cards, certificates, speaker cards or a poster per city, the design marks what changes with `data-od-field="<column>"` (text, an image's `src`, or a link's `href`) and, for a per-person QR code, `data-od-qr-field="<column>"`. Export with `data`:

```json
{ "entryPath": ".open-design/badge/badge.html", "preset": "a4", "data": "attendees.csv", "nameField": "name" }
```

- `data` is a CSV, an XLSX file (first sheet, or `sheet`), or a JSON array of objects. The first row is the header. At most 200 rows per export.
- Images come out one per row, named from `nameField` (`badge-ada-lovelace.png`) or numbered. A print PDF comes out as **one multi-page PDF**, ready to send to a printer; `split: true` gives one PDF per row.
- The values are filled into the rendered page only. The HTML file isn't changed. A line break inside a cell becomes a line break on the poster.
- Every field must have a column, or the export stops before rendering and lists the columns it found.
- Preflight runs for every row and names the row, so a name too long for its box shows up as, for example, `row 7 (Bartholomew Featherstonehaugh)`.
- With a fluid poster, add `presets` to get every row at every shape. Images are named `<name>-<row>-<format>`, for example `badge-ada-lovelace-story.png`. Print shapes give one multi-page PDF per shape (or one per row and shape with `split`). Rows × shapes is limited to 400 files per export.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/badge/badge.html --preset a4 --data attendees.csv --name-field name`

## What you get

```
.open-design/hack-night/hack-night.html                  ← one fluid poster, every shape
.open-design/hack-night/assets/signup-qr.svg
.open-design/hack-night/exports/hack-night.pdf           ← preset "a3": A3 plus bleed, trim and bleed boxes set
.open-design/hack-night/exports/hack-night-shapes.png    ← shapeSheet: the poster at every shape
.open-design/hack-night/exports/hack-night-a3.pdf        ← presets: one file per shape
.open-design/hack-night/exports/hack-night-poster-24x36.pdf
.open-design/hack-night/exports/hack-night-story.png
```

## Troubleshooting

- [No Chrome, Edge, or Chromium browser was found](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found)
- [Fonts look wrong in exports](../troubleshooting.md#fonts-look-wrong-in-exports)
- [Emoji show as empty boxes](../troubleshooting.md#emoji-show-as-empty-boxes)

## Related

[Social media posts](social-posts.md) · [Export images](export-images.md) · [Export decks and PDFs](export-decks.md) · [Explore design directions](explore-directions.md)
