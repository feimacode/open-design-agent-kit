## ADDED Requirements

### Requirement: Speaker Notes in PowerPoint Export
When a deck is exported with `format: "pptx"`, each slide's speaker notes (the text of `aside.notes` or `.speaker-notes` elements inside that slide, the same presenter-notes elements the capture already hides; a bare `.notes` class can be visible slide content and is not used) SHALL be written as that PowerPoint slide's notes, with whitespace collapsed within each paragraph and at most 10,000 characters per slide. Slides without notes SHALL have no notes. The slide images, PDF export and image export SHALL be unchanged.

#### Scenario: Deck with notes
- **WHEN** a 3-slide deck whose second slide contains `<aside class="notes">Source: Q3 report §2</aside>` is exported to PPTX
- **THEN** the PPTX's second slide SHALL have the notes "Source: Q3 report §2", and the first and third slides SHALL have none

#### Scenario: Notes not visible on the slide
- **WHEN** the same deck is exported
- **THEN** the notes text SHALL NOT appear in any slide image
