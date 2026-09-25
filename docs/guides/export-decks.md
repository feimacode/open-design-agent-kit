# Export decks and PDFs

Turn a slide deck into **PowerPoint** or a **PDF**, export chosen slides as images, or print an ordinary page to a **vector PDF**.

## Before you start

The same as [Export images](export-images.md#before-you-start): a registered artifact and an installed Chrome, Edge or Chromium.

## Export a deck

Ask:

> Export this deck as PowerPoint.

> Give me slides 1 and 3 as PNGs.

The agent calls [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact) with `format: "pptx"`, `"pdf"`, or `"png"` plus `slides: [1, 3]`. After registering a new deck, the agent offers these exports on its own.

> **In VS Code:** `#od-export`, or just ask.

> **From the CLI:**
>
> ```bash
> npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pptx
> npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format pdf
> npx @feimacode/open-design-agent-kit export .open-design/pitch/pitch.html --format png --slides 1,3
> ```

| Format | You get |
|---|---|
| `pptx` | `exports/<name>.pptx`: one full-bleed image per slide. It looks exactly like the HTML, but the text isn't editable in PowerPoint. 16:9 decks use PowerPoint's 16:9 layout; other shapes get a matching custom size. |
| `pdf` | `exports/<name>.pdf`: one page per slide, in the deck's own shape. |
| `png` / `jpeg` with `slides` | `exports/<name>-NN.png`: one image per chosen slide, numbered by slide. |

`slides` also works with `pptx` and `pdf`, to include only those slides in that order. Decks are captured at scale 2 by default so text stays crisp when projected; `scale: 1` makes files about four times smaller.

## Print a page to PDF

For a report, résumé or any ordinary page, `format: "pdf"` uses the browser's print engine. You get **real, selectable text**, paginated by the page's print CSS, A4 unless the page sets `@page { size: … }`. `width` and `height` set a custom page size.

## How decks are detected

An artifact is treated as a deck when any of these is true:

- you pass `deck: true` (or `--deck`);
- it was registered with kind `deck`;
- it came from a deck recipe (source skill `od:deck:*`) and has at least two slides. This covers remixed decks, which are registered as `html`.

A page that merely contains slide-like markup (such as a testimonial carousel) stays a page. Asking for PowerPoint of a page fails with `not-a-deck`; pass `deck: true` if it really is a deck.

## How slides are captured

This follows upstream Open Design's desktop exporter:

1. **Find the slides:** `.slide`, `[data-screen-label]`, `.deck-slide` or `.ppt-slide`, skipping presenter-mode copies.
2. **Lay out and prepare:** lay the deck out at 1920×1080, hide presenter chrome (progress bars, speaker notes, navigation hints, counters), and freeze animations.
3. **Measure** the deck's own slide size (so 4:3 and square decks keep their shape), and pin the page to it.
4. **Show one slide at a time**, using the conventions real decks use (active classes, visibility), and restack slides that carousel-style decks keep off-screen.
5. **Handle `<deck-stage>` decks without their script:** a small built-in fallback is injected into the served copy only. Your file isn't changed.
6. **Screenshot and assemble:** capture each slide, then build the file with `pptxgenjs` or `pdf-lib`.

All 54 bundled example decks export this way.

## Limits

- **The PowerPoint text isn't editable.** Each slide is an image.
- **Unlabelled on-screen overlays can show up on every slide.** A deck's own floating hint bar with no class (a `position: fixed` element outside the slides) isn't recognized as chrome.
- **Size:** image-heavy decks can reach 10–20 MB at scale 2.

## Troubleshooting

- [Export failed (not-a-deck)](../troubleshooting.md#export-failed-not-a-deck)
- [Export failed (no-slides)](../troubleshooting.md#export-failed-no-slides)
- [A slide looks blank](../troubleshooting.md#a-slide-looks-blank)
- [No Chrome, Edge, or Chromium browser was found](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found)

## Related

[Export images](export-images.md) · [Artifact manifest](../reference/artifact-manifest.md#exports-by-kind)
