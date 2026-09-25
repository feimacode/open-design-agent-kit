## Why

Decks are one of Open Design's most-used outputs, and upstream Open Design's desktop app exports them to PowerPoint and PDF. Our extension can only produce the deck's HTML, which most people can't present from or send around. On top of that, every artifact we register advertises `exports: ["html", "pdf", "zip"]` even though we implement neither PDF nor zip. The `social-post-export` change gave us a headless-browser export pipeline in all three hosts, so deck export is now a small extension of it rather than a new subsystem.

## What Changes

- **`export_open_design_artifact` gains `format: "pptx"` and `format: "pdf"`**, in the VS Code tool, the MCP tool and the CLI's `export --format`.
  - **Deck PPTX (screenshot-based):** one full-bleed PNG per slide, assembled with `pptxgenjs` (MIT). The slide layout follows the deck's measured aspect ratio: PowerPoint's 16:9 layout, otherwise a custom size. Pixel-perfect, not editable.
  - **Deck PDF:** the same slide images, one page per slide, assembled with `pdf-lib` (MIT).
  - **Page PDF (non-deck artifacts):** a vector PDF with selectable text via the browser's own print engine (`page.pdf()`), paginated by the page's print CSS.
- **Deck detection and slide capture ported from upstream** (`apps/desktop/src/main/deck-capture.ts`, `apps/daemon/src/deck-export.ts`, Apache-2.0, with attribution in `vendored/SOURCE.md`):
  - the slide selector family: `.slide`, `[data-screen-label]`, `.deck-slide`, `.ppt-slide`, excluding presenter-mode clones;
  - hiding deck chrome (progress bars, notes, nav);
  - freezing animations;
  - measuring the authored slide size instead of assuming 16:9;
  - showing one slide at a time through the deck conventions real decks use;
  - restacking slides that a carousel positions off-screen.
- **`<deck-stage>` decks keep working.** When an artifact uses `<deck-stage>` but doesn't load its runtime, export injects upstream's deck-stage fallback so slides are addressable.
- **Page vs deck is decided safely.** An explicit `deck` argument wins. Otherwise the artifact's kind or renderer (`deck` / `deck-html`) or the presence of real slide elements decides. An ordinary page containing `.slide` markup (a testimonial carousel) is only treated as a deck when explicitly asked.
- **An optional `slides` argument** exports a subset of slides (e.g. `[1, 3]`) as PNG/JPEG images, one per slide, reusing the existing image path.
- **The manifest's `exports` list tells the truth.** Registration and remix record what we can actually produce, e.g. `["html", "png", "jpeg", "pdf"]` for pages and `["html", "png", "jpeg", "pdf", "pptx"]` for decks. The vendored manifest validator's allow-list gains `png`, `jpeg` and `pptx`, as a documented divergence. **BREAKING (minor):** newly registered artifacts no longer list `zip`; existing manifests are untouched.
- **The deck skills and the overview skill mention the export**, e.g. "after registering a deck, offer PPTX/PDF export".
- **Out of scope (designed for, not built):** editable PPTX via the vendored `dom-to-pptx` 2.0.1 browser bundle (native shapes and text). The capture pipeline is structured so that it plugs in as another step after "prepare deck" (see design).
- **Out of scope:** zip export, and PPTX from non-deck pages.

## Capabilities

### New Capabilities
- `deck-export`: deck detection and preparation, slide-by-slide capture, screenshot PPTX and PDF assembly, slide subsets, page-mode vector PDF, and `<deck-stage>` fallback handling.

### Modified Capabilities
- `artifact-export`: the export tool accepts the `pptx` and `pdf` formats, plus `deck` and `slides` arguments, and routes them to deck or page export. Manifests record accurate export formats. (This capability is introduced by the not-yet-archived `social-post-export` change; archive that first, and this change's requirements are added to it.)

## Impact

- **packages/core**:
  - a new `export/deck/` module (in-page scripts ported from upstream, the capture loop, PPTX and PDF assembly);
  - `exportArtifact` routes the new formats there;
  - the vendored `artifactManifest.ts` allow-list is extended and `SOURCE.md` updated;
  - the `<deck-stage>` fallback is ported from `packages/contracts/src/runtime/deck-stage-fallback.ts`.
- **packages/vscode, packages/mcp-server**:
  - the tool schemas gain `format` values and the `deck` and `slides` arguments;
  - `KIND_TO_EXPORTS` is corrected in `registerArtifactTool.ts`, `tools.ts` and `remixOrchestrator.ts`;
  - the overview skill and chat instructions mention deck export.
- **packages/cli**: `export --format pptx|pdf`, `--deck`, `--slides`.
- **Dependencies**: adds `pptxgenjs` and `pdf-lib` to core, both pure JS and bundled, so there's no new runtime requirement. The same installed Chromium-family browser is needed.
- **Bundle size**: roughly +0.6 MB minified per bundle (VS Code extension, MCP server, CLI).
