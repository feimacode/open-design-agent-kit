## ADDED Requirements

### Requirement: Deck Detection Without Mutating Pages
The system SHALL decide whether to export an artifact as a deck or as a page, in this order: an explicit `deck` argument; then a manifest `kind` of `deck` or `renderer` of `deck-html`; then a count of real slide elements (`.slide, [data-screen-label], .deck-slide, .ppt-slide`, excluding any inside `.mini-slide, .overview, .notes-overlay, .thumb`). The count SHALL be taken without modifying the document, so a page-mode export captures the original DOM. An artifact resolved as a page SHALL NOT be exported as PPTX.

#### Scenario: Registered deck needs no flag
- **WHEN** an artifact registered with kind `deck` and containing 8 `.slide` elements is exported with `format: "pptx"`
- **THEN** it SHALL be exported as an 8-slide deck

#### Scenario: Page with slide-like markup stays a page
- **WHEN** an artifact registered with kind `html` from a non-deck skill contains a testimonial carousel of `.slide` elements and is exported with `format: "pdf"`
- **THEN** it SHALL be exported as a page PDF, and its DOM SHALL NOT have been modified before capture

#### Scenario: Explicit deck with no slides fails clearly
- **WHEN** an artifact with no slide elements is exported with `deck: true`
- **THEN** the export SHALL fail with code `no-slides` and write no file

#### Scenario: PPTX requested for a page
- **WHEN** an artifact resolved as a page is exported with `format: "pptx"`
- **THEN** the export SHALL fail with code `not-a-deck`, and the message SHALL suggest passing `deck: true` if the artifact really is a deck

### Requirement: Deck Preparation and Stage Measurement
In deck mode, the system SHALL, before capturing:
- hide deck chrome (`.progress-bar, .notes-overlay, aside.notes, .speaker-notes, .deck-nav, .deck-hint, .deck-counter`);
- disable animations and transitions;
- force lazy-loaded images to load eagerly;
- set `noscale` and remove transforms on `deck-stage, #deck-stage, .deck-stage`;
- measure the authored slide size (in order: deck-stage design size, width/height attributes, inline style, computed size, offset size; clamped to a sane range; falling back to 1920×1080), unless an explicit `width` and `height` are given;
- pin the page and the stage to that size.

#### Scenario: 4:3 deck keeps its aspect ratio
- **WHEN** a deck whose slides are authored at 1024×768 is exported to PPTX
- **THEN** each slide image SHALL be 1024×768 at the capture scale, and the PPTX slide layout SHALL have a 4:3 aspect ratio, not 16:9

#### Scenario: Presenter chrome is not captured
- **WHEN** a deck with a visible `.progress-bar` and `.deck-counter` is exported
- **THEN** neither element SHALL appear in any captured slide

### Requirement: One Slide at a Time Capture
For each slide to capture, the system SHALL make only that slide visible, using the conventions real decks use: inline `!important` opacity/visibility/z-index overrides, the `active`/`visible`/`is-active`/`current` classes, and the `data-od-deck-active` attribute. It SHALL wait two animation frames, and, if the slide's box does not cover the stage (for example a horizontally translated carousel), temporarily move the live slide into a fixed capture layer, restoring it afterwards. Each slide SHALL be captured at the stage size times the capture scale.

#### Scenario: Class-toggled deck
- **WHEN** a deck shows only its `.slide.active` element via its own CSS and has 5 slides
- **THEN** 5 distinct slide images SHALL be captured, each showing its own slide's content

#### Scenario: Carousel-strip deck
- **WHEN** a deck lays slides out in a flex strip and pages by translating it
- **THEN** each captured image SHALL show its own slide aligned to the stage, not an off-screen region or the first slide

#### Scenario: Blank slide warning
- **WHEN** a captured slide image is a single uniform color
- **THEN** the export SHALL still complete, and its warnings SHALL name that slide number

### Requirement: Screenshot PPTX Assembly
The system SHALL assemble captured slides into a `.pptx` with one full-bleed image per slide, in deck order. The layout SHALL be PowerPoint's 16:9 when the stage aspect ratio is within 0.01 of 16:9, and otherwise a custom layout 13.333 inches wide with a height matching the stage aspect ratio. The file SHALL carry the deck's title and be written to `<artifact-dir>/exports/<entry-basename>.pptx`.

#### Scenario: 16:9 deck to PPTX
- **WHEN** a 6-slide 1920×1080 deck is exported with `format: "pptx"`
- **THEN** a valid PPTX archive SHALL be written containing 6 slides and 6 slide images, using the 16:9 layout

### Requirement: Deck and Page PDF
For a deck, `format: "pdf"` SHALL produce one page per captured slide, each sized to the slide's aspect ratio with its longest side normalized to 960 pt. For a page, `format: "pdf"` SHALL use the browser's print engine with print media emulation, background graphics and zero margins, respecting the page's CSS `@page` size and defaulting to A4, so the PDF keeps vector, selectable text.

#### Scenario: Deck PDF
- **WHEN** a 6-slide deck is exported with `format: "pdf"`
- **THEN** a 6-page PDF SHALL be written, with each page's aspect ratio matching the deck's slides

#### Scenario: Page PDF keeps selectable text
- **WHEN** a long HTML report page is exported with `format: "pdf"`
- **THEN** the PDF SHALL paginate the content and its text SHALL be extractable as text, not only as images

### Requirement: Slide Subsets as Images
When `slides` (1-based slide numbers) is given with an image format (`png` or `jpeg`), the system SHALL export only those slides, one file per slide, named `<entry-basename>-NN.<ext>` using the slide's own number. Numbers out of range SHALL fail the export and name the valid range. With `pptx` or `pdf`, `slides` SHALL limit the document to those slides in the given order.

#### Scenario: Export slides 1 and 3 as PNG
- **WHEN** a 5-slide deck is exported with `format: "png"` and `slides: [1, 3]`
- **THEN** exactly `<basename>-01.png` and `<basename>-03.png` SHALL be written

#### Scenario: Out-of-range slide
- **WHEN** a 5-slide deck is exported with `slides: [7]`
- **THEN** the export SHALL fail with a message naming the valid range 1–5, and write no file

### Requirement: Deck-Stage Fallback
When an artifact's entry HTML uses a `<deck-stage>` element but does not load a deck-stage runtime script, the system SHALL inject Open Design's deck-stage fallback into the served entry document (not the file on disk) before loading it, so its slides can be addressed and captured.

#### Scenario: deck-stage without runtime
- **WHEN** a deck whose slides are slotted into `<deck-stage>` is exported and no `deck-stage.js` is referenced
- **THEN** every slide SHALL be captured, and the artifact's file on disk SHALL be unchanged

### Requirement: Provenance of Ported Deck Code
Deck-capture code adapted from upstream Open Design (Apache-2.0) SHALL carry a header comment naming its upstream source file, and `packages/core/src/vendored/SOURCE.md` SHALL document what was ported and every divergence.

#### Scenario: Attribution present
- **WHEN** the deck export module is reviewed
- **THEN** each ported file SHALL name its upstream origin, and SOURCE.md SHALL have a deck-export section listing those files and the divergences (moveBefore fallback, eager images, no editable mode)
