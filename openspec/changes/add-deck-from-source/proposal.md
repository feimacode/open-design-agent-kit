## Why

Turning an existing document into a deck is one of the most common real requests: a report, a spec or a spreadsheet becomes a board update, a pitch or a review. Dedicated design tools lead with it ("upload a DOCX or PPTX, get an on-brand deck"). We already render decks well (about 50 deck templates, plus PPTX, PDF and Canva export), but the steps around the slides are missing:

- **Reading the source:** no agent host reads DOCX, PPTX or XLSX directly, because they are zipped XML, and PDF support varies by host.
- **Deciding the story:** skills assume a short brief. Given a long document, the model tends to paste sections onto slides, and the user never gets to approve a storyline before slides are built.
- **Keeping it accurate:** nothing links a slide back to its source, so rounded, merged or invented numbers go unnoticed. That's the fastest way to lose trust in a deck.
- **Keeping the detail:** detail cut from slides is lost. Our deck templates support speaker notes, but PPTX export drops them.

We also have an advantage a separate design app can't easily match: the agent is already inside the repository. A CHANGELOG, an RFC, architecture decision records or a metrics CSV can become a release, review or sprint deck in one request, and the source files are right there.

## What Changes

- **New tool `read_open_design_source`:** converts a workspace document (DOCX, PPTX, XLSX, PDF, Markdown, plain text, CSV) into Markdown under `.open-design/sources/<slug>/`. It extracts embedded images to an `assets/` folder there and returns a section outline with sizes, so the agent reads only what it needs. Results are cached by content hash. DOCX, PPTX and XLSX extraction is vendored from upstream Open Design's `document-preview.ts` (Apache-2.0, JSZip-based, with zip-bomb and XML-size limits). PDF uses `pdftotext` when it is installed; otherwise the tool tells the agent to read the PDF with its own tools.
- **`prepare_open_design_brief` gains `sources`:** a list of workspace document paths. When given, it extracts them (cached), and the instructions add a source section and a **storyline-first** workflow:
  1. write `outline.md`, with one entry per slide giving a takeaway headline, supporting points, visual type and a source reference;
  2. stop and show it to the user;
  3. build the deck from the approved outline.

  The user can skip approval ("just build it"). Accuracy rules apply throughout: numbers, names and quotes exactly as in the source; no invented statistics (labelled placeholders instead); and detail cut from a slide moves into its speaker notes, with a source note.
- **`register_open_design_artifact` gains `sources`:** it records `[{ path, sha256 }]` in the manifest, and the result includes a **number check** listing numbers that appear on the slides but nowhere in the sources, so the agent can fix them before presenting.
- **`get_open_design_artifact` reports `staleSources`:** recorded sources whose content has changed since registration. This is detection only; rebuilding from the updated source is a later phase.
- **PPTX export carries speaker notes:** each slide's `aside.notes` / `.speaker-notes` text becomes that slide's PowerPoint notes. Slides stay full-bleed images; editable PPTX is a separate change.
- **New curated command `open-design-deck-from-source`** (local overlay prompt, rendered for every host, with its own `model_trigger`). The overview skill and VS Code instructions learn when to use sources: whenever a deck or one-pager request names or attaches a document, or points at repository files.
- **Docs:** a new "Turn a document into a deck" guide (including repository-source examples such as a release deck from CHANGELOG), plus reference updates for the tool, arguments, manifest fields and PPTX notes.

## Capabilities

### New Capabilities
- `deck-from-source`: source document extraction and caching, source-aware brief composition (storyline-first workflow and accuracy rules), source recording and the number check on registration, stale-source detection, and the curated command and agent guidance.

### Modified Capabilities
- `deck-export`: the screenshot PPTX now carries each slide's speaker notes (an added requirement; existing requirements are unchanged).

## Impact

- **Core** (`packages/core`):
  - newly vendored `vendored/documentExtract.ts`, recorded in `SOURCE.md`
  - new `workspace/sourceStore.ts` (extraction cache, outline, assets)
  - new `generation/sourceInstructions.ts` (source section, storyline workflow, accuracy rules)
  - new number-check module
  - `composeInstructions` gains a sources input
  - manifest gains optional `sources`
  - deck capture collects per-slide notes, and `assemblePptx` writes them
- **MCP server and VS Code:** one new tool; `prepare_open_design_brief`, `register_open_design_artifact` and `get_open_design_artifact` change shape (new optional arguments and result fields); `package.json` contributions.
- **Content:** `local/prompts/deck-from-source.md` and the regenerated skills and prompt files.
- **Dependencies:** `jszip` becomes a direct dependency of core. It is already installed through `pptxgenjs`, so the package size doesn't change. `pdftotext` (poppler) is optional and never installed by us.
- **Docs:** the new guide, tools, artifact manifest, prompts-and-commands, and export-decks (speaker notes).
