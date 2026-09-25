# Export images

Turn a registered artifact into PNG or JPEG files, sized correctly and within a file-size budget. For decks as PowerPoint or PDF, see [Export decks and PDFs](export-decks.md).

## Before you start

- **A registered artifact.** Designs made or remixed through Open Design already are.
- **An installed Chrome, Edge or Chromium.** Export renders the page in a real headless browser, found automatically and never downloaded; see [the search order](../reference/settings-and-env.md#open_design_browser_path). On a machine without one, install Google Chrome, set `OPEN_DESIGN_BROWSER_PATH`, or run once:

  ```bash
  npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer
  ```

## Export

Ask:

> Export the launch card as a PNG under 5 MB.

The agent calls [`export_open_design_artifact`](../reference/tools.md#export_open_design_artifact).

> **In VS Code:** reference the tool directly with `#od-export`.

> **From the CLI:** `npx @feimacode/open-design-agent-kit export .open-design/launch/launch.html --max-bytes 5000000` ([options](../reference/cli.md#export)).

## Size

The output size is decided in this order, and the result says which rule applied:

1. **Explicit** `width` and `height` (CSS pixels).
2. **The recipe's size:** the `aspect_hint` of the artifact's source skill, e.g. `card-twitter` gives 1600×900.
3. **Each selected element's own box**, when a `selector` is given.
4. **1080×1080** otherwise.

`scale` (1–3) multiplies the pixels without changing the layout: `scale: 2` on a 1280×720 design gives 2560×1440.

## One image per card

Carousels and card sets put several cards in one page. Mark each card with `data-od-card` and pass `selector: "[data-od-card]"`. You get one image per card, in page order, named `<name>-01.png`, `<name>-02.png`, and so on. A selector that matches a single card gives a plain `<name>.png`.

## File-size budget

Pass `maxBytes` (X: 5000000, YouTube thumbnail: 2000000, Instagram: 8000000). An image over budget is re-encoded as JPEG at quality 90, 80, 70 and so on down to 40, stopping at the first that fits. If even quality 40 doesn't fit, the smallest version is kept with a warning.

## What happens during export

1. The workspace is served on a private `127.0.0.1` address, so ES modules, `fetch` and `../shared.css`-style paths work.
2. The page loads in a fresh temporary browser profile.
3. The exporter waits for network requests to finish (up to 15 s), web fonts to load, and a short settle for entrance animations.
4. Failed requests (a 404 image, for example) come back as warnings.
5. Files go to `<artifact-dir>/exports/`, and each export is recorded in the manifest's [`metadata.exports`](../reference/artifact-manifest.md#metadataexports).

## Troubleshooting

- [No Chrome, Edge, or Chromium browser was found](../troubleshooting.md#no-chrome-edge-or-chromium-browser-was-found)
- [Export failed (not-registered)](../troubleshooting.md#export-failed-not-registered)
- [Emoji show as empty boxes](../troubleshooting.md#emoji-show-as-empty-boxes)
- [Fonts look wrong in exports](../troubleshooting.md#fonts-look-wrong-in-exports)
- [File is over the byte budget](../troubleshooting.md#file-is-over-the-byte-budget)

## Related

[Social media posts](social-posts.md) · [Export decks and PDFs](export-decks.md)
