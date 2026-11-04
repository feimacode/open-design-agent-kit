## ADDED Requirements

### Requirement: Editable PPTX Export
When a deck is exported with `format: "pptx"` and `editable: true`, the system SHALL use the picture export's deck detection, preparation, stage measurement, slide layout rule, `slides` handling and speaker notes, and SHALL write a PowerPoint file of native objects placed from the browser's layout to `<artifact-dir>/exports/<entry-basename>-editable.pptx`. `editable` with any other format SHALL fail. Without `editable`, `format: "pptx"` SHALL be unchanged.

#### Scenario: Editable export of a 16:9 deck
- **WHEN** a 6-slide 1920×1080 deck is exported with `format: "pptx"` and `editable: true`
- **THEN** `<basename>-editable.pptx` SHALL be written with 6 slides in the 16:9 layout, and any existing `<basename>.pptx` SHALL be left untouched

#### Scenario: Editable with a non-PPTX format
- **WHEN** a deck is exported with `format: "pdf"` and `editable: true`
- **THEN** the export SHALL fail, say that `editable` applies to `pptx` only, and write no file

### Requirement: Native Text Boxes
In an editable export, the system SHALL create a text box for each visible block of text, keeping its runs' font family (first in the computed stack), size, bold (weight 600 or more), italic, colour, letter spacing and line breaks, its alignment and line height, and applying `text-transform: uppercase` to the text. Single-line text SHALL NOT wrap; multi-line text SHALL wrap within the block's content width.

#### Scenario: Title can be edited
- **WHEN** a slide with an `<h1>` "Q3 results" in Inter 64 px bold is exported as editable PPTX
- **THEN** that slide SHALL contain a text box whose text is "Q3 results", with font Inter, bold, at the size matching 64 px on the slide

### Requirement: Native Shapes and Pictures
In an editable export, the system SHALL create a rectangle, or a rounded rectangle when there is a border radius, for each element with a solid background or a uniform border, and a thin rectangle for each single side border. It SHALL create a picture for each `<img>` and `url()` background image, cropped to match `object-fit` and `background-size: cover`, and SHALL use the slide's own solid background colour as the slide background.

#### Scenario: Card becomes a shape
- **WHEN** a slide has a card with a solid white background, a 1 px grey border and a 12 px radius
- **THEN** the slide SHALL contain a rounded rectangle at the card's position with that fill and border

### Requirement: Effects Are Not Made Native
Elements with a transform, opacity below 1, a filter, a clip path, a blend mode or a gradient fill, and their descendants, SHALL NOT be turned into native objects in an editable export, and SHALL be listed as flattened.

#### Scenario: Rotated label is not straightened
- **WHEN** a slide has a label rotated by 90 degrees
- **THEN** the label SHALL appear on the slide's background picture, not as a text box, and SHALL be listed as flattened

### Requirement: Background Picture for Unsupported Effects
For each slide of an editable export, the system SHALL hide the elements it turned into native objects and capture what remains of the slide as a background picture: gradients, shadows, pseudo-element decoration, SVG, canvas and the elements excluded from native objects. This picture SHALL be placed below the native objects. A background picture that is a single uniform colour SHALL be dropped. The page SHALL be restored before the next slide is read.

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

## MODIFIED Requirements

### Requirement: Provenance of Ported Deck Code
Deck-capture code adapted from upstream Open Design (Apache-2.0) SHALL carry a header comment naming its upstream source file, and `packages/core/src/vendored/SOURCE.md` SHALL document what was ported and every divergence. Editable PPTX export is the kit's own code and SHALL NOT be described as ported; SOURCE.md SHALL say that upstream's editable mode (vendored `dom-to-pptx`) was not adopted.

#### Scenario: Attribution present
- **WHEN** the deck export module is reviewed
- **THEN** each ported file SHALL name its upstream origin, and SOURCE.md SHALL have a deck-export section listing those files and the divergences (moveBefore fallback, eager images, editable mode implemented separately instead of `dom-to-pptx`)
