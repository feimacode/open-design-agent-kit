# deck-export Specification

## Purpose
Export slide decks the way upstream Open Design's desktop app does: detect decks safely, prepare them (hide presenter chrome, freeze animations, measure the authored slide size), capture one slide at a time, and assemble a screenshot-based PPTX or PDF. Ordinary pages print to a vector PDF.
## Requirements
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
Deck-capture code adapted from upstream Open Design (Apache-2.0) SHALL carry a header comment naming its upstream source file, and `packages/core/src/vendored/SOURCE.md` SHALL document what was ported and every divergence. Editable PPTX export is the kit's own code and SHALL NOT be described as ported; SOURCE.md SHALL say that upstream's editable mode (vendored `dom-to-pptx`) was not adopted.

#### Scenario: Attribution present
- **WHEN** the deck export module is reviewed
- **THEN** each ported file SHALL name its upstream origin, and SOURCE.md SHALL have a deck-export section listing those files and the divergences (moveBefore fallback, eager images, editable mode implemented separately instead of `dom-to-pptx`)

### Requirement: Speaker Notes in PowerPoint Export
When a deck is exported with `format: "pptx"`, each slide's speaker notes (the text of `aside.notes` or `.speaker-notes` elements inside that slide, the same presenter-notes elements the capture already hides; a bare `.notes` class can be visible slide content and is not used) SHALL be written as that PowerPoint slide's notes, with whitespace collapsed within each paragraph and at most 10,000 characters per slide. Slides without notes SHALL have no notes. The slide images, PDF export and image export SHALL be unchanged.

#### Scenario: Deck with notes
- **WHEN** a 3-slide deck whose second slide contains `<aside class="notes">Source: Q3 report §2</aside>` is exported to PPTX
- **THEN** the PPTX's second slide SHALL have the notes "Source: Q3 report §2", and the first and third slides SHALL have none

#### Scenario: Notes not visible on the slide
- **WHEN** the same deck is exported
- **THEN** the notes text SHALL NOT appear in any slide image

### Requirement: Editable PPTX Export
When a deck is exported with `format: "pptx"` and `editable: true`, the system SHALL use the picture export's deck detection, preparation, stage measurement, slide layout rule, `slides` handling and speaker notes, and SHALL write a PowerPoint file of native objects placed from the browser's layout to `<artifact-dir>/exports/<entry-basename>-editable.pptx`. `editable` with any other format SHALL fail. Without `editable`, `format: "pptx"` SHALL be unchanged.

#### Scenario: Editable export of a 16:9 deck
- **WHEN** a 6-slide 1920×1080 deck is exported with `format: "pptx"` and `editable: true`
- **THEN** `<basename>-editable.pptx` SHALL be written with 6 slides in the 16:9 layout, and any existing `<basename>.pptx` SHALL be left untouched

#### Scenario: Editable with a non-PPTX format
- **WHEN** a deck is exported with `format: "pdf"` and `editable: true`
- **THEN** the export SHALL fail, say that `editable` applies to `pptx` only, and write no file

### Requirement: Native Text Boxes
In an editable export, the system SHALL create a text box for each visible block of text, keeping its runs' font family (first in the computed stack), size, bold (weight 600 or more), italic, colour, letter spacing and line breaks, its alignment and line height, and applying `text-transform` to the text. Single-line text SHALL NOT wrap; multi-line text SHALL wrap within the block's content width. A list item with an outside disc, circle, square or numbered marker SHALL get a PowerPoint bullet or number instead of the marker.

#### Scenario: Title can be edited
- **WHEN** a slide with an `<h1>` "Q3 results" in Inter 64 px bold is exported as editable PPTX
- **THEN** that slide SHALL contain a text box whose text is "Q3 results", with font Inter, bold, at the size matching 64 px on the slide

### Requirement: Native Shapes and Pictures
In an editable export, the system SHALL create a rectangle, or a rounded rectangle when there is a border radius, for each element with a solid background or a uniform border, and a thin rectangle for each single side border. It SHALL create a picture for each `<img>` and `url()` background image, cropped to match `object-fit` and `background-size: cover`, and SHALL use the slide's own solid background colour as the slide background.

#### Scenario: Card becomes a shape
- **WHEN** a slide has a card with a solid white background, a 1 px grey border and a 12 px radius
- **THEN** the slide SHALL contain a rounded rectangle at the card's position with that fill and border

### Requirement: Effects Are Not Made Native
Elements with a transform other than a translation, a filter, a clip path or mask, a blend mode or gradient text (`background-clip: text`), and their descendants, SHALL NOT be turned into native objects in an editable export, and SHALL be listed as flattened. Opacity below 1 SHALL be carried as transparency instead; faded text over a solid colour SHALL be written as the solid colour it looks like.

#### Scenario: Rotated label is not straightened
- **WHEN** a slide has a label rotated by 90 degrees
- **THEN** the label SHALL appear on the slide's background picture, not as a text box, and SHALL be listed as flattened

#### Scenario: Faded text stays editable
- **WHEN** a slide has black text at opacity 0.5 on a white panel
- **THEN** it SHALL be a text box in mid grey

### Requirement: Background Picture for Unsupported Effects
For each slide of an editable export, the system SHALL hide the elements it turned into native objects and capture what remains of the slide as a background picture: gradients, shadows, pseudo-element decoration, SVG, canvas and the elements excluded from native objects. This picture SHALL be placed below the native objects. A native shape or picture painted below a flattened element and overlapping it SHALL be left on the background picture too, so it can't cover that element. A background picture that is a single uniform colour SHALL be dropped. The page SHALL be restored before the next slide is read.

#### Scenario: Gradient and decoration kept
- **WHEN** a slide has a gradient background, a `::before` frame bar and an editable heading
- **THEN** the slide SHALL show the gradient and the frame bar on its background picture, and the heading SHALL be a text box above it, not on the picture

#### Scenario: Plain slide has no background picture
- **WHEN** a slide has only a solid background colour, text and solid boxes
- **THEN** the slide SHALL have no background picture and SHALL use that colour as its background

### Requirement: SVG Diagrams Stay Pictures
In an editable export, an `<svg>` element and everything inside it SHALL be part of the slide's background picture, and SHALL be listed as flattened. It SHALL NOT be converted into lines or shapes.

#### Scenario: Architecture diagram
- **WHEN** a slide contains an SVG architecture diagram with labelled boxes and curved arrows
- **THEN** the diagram SHALL appear as drawn, on the background picture, and the report SHALL list it as flattened for that slide

### Requirement: Editable Export Report
The result of an editable export SHALL list, for each slide, the number of text boxes, shapes and pictures created and what was flattened, with a reason (svg, canvas, transformed, gradient text, other). It SHALL list every font family used and mark the ones loaded as web fonts, which PowerPoint replaces when they aren't installed.

#### Scenario: Report names fonts and flattened parts
- **WHEN** a deck using the web font "Space Grotesk" with an SVG chart on slide 4 is exported as editable PPTX
- **THEN** the result SHALL list "Space Grotesk" as a web font and slide 4's chart as flattened (svg)

### Requirement: Text Coverage
Every visible, non-empty text on a slide SHALL either be in a text box of an editable export or be listed as flattened. Any text that is neither SHALL produce a warning naming the slide.

#### Scenario: Vendored decks are fully covered
- **WHEN** each vendored deck example is exported as editable PPTX in the test suite
- **THEN** every visible text of every slide SHALL be found in that slide's XML or in its flattened list
