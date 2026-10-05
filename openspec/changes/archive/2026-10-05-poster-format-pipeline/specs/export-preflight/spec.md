## ADDED Requirements

### Requirement: Automatic Preflight on Page Exports
Every page-mode export (images and page PDFs, not decks or packaging formats) SHALL run preflight checks in the export browser after the page is ready and before capture. It SHALL return findings as structured data `{ check, severity, message, selector?, card?, row? }` with severity `error`, `warning` or `info`. Findings SHALL NOT block the export. The formatted result SHALL list errors first.

#### Scenario: Clean poster
- **WHEN** a poster with no problems is exported
- **THEN** the result SHALL report the checks as passed, with no errors or warnings

#### Scenario: Findings don't block output
- **WHEN** preflight finds an error
- **THEN** the files SHALL still be written and the error SHALL appear in the result

### Requirement: Preflight Checks
Preflight SHALL include at least these checks:
- `overflow`: text clipped by its container or extending outside the card.
- `safe-area`: text, images or SVG outside the card's safe inset (plus bleed for print); full-bleed backgrounds are exempt.
- `min-type`: text below the format's minimum size (print, in points at the printed size) or below 14 px on screen formats up to 1080 px wide.
- `contrast`: a WCAG contrast ratio below 4.5:1 for body text or 3:1 for large text, measured against the nearest solid background. When the background is a gradient or image, the check is skipped and reported as `info`.
- `emoji`: text containing emoji glyphs that may render as empty boxes on machines without an emoji font.
- `image-ppi`: print only. Effective resolution below 150 ppi is a warning and below 100 ppi an error.
- `qr`: a `[data-od-qr]` element that doesn't decode to its attribute value.
- `broken-asset`: an image, font or stylesheet that failed to load.
- `overlap`: lines of text from two unrelated elements drawn over each other, which is typical when a long bound value pushes into the next block. Each line is compared by its middle band, so tight leading isn't flagged.
- `card-size`: screen formats only. A `[data-od-card]` that isn't the format's pixel size, for example squeezed by a preview wrapper.

#### Scenario: Low-resolution photo on an A2 poster
- **WHEN** a 1200 px-wide image is rendered 400 mm wide on an A2 print export
- **THEN** preflight SHALL report an `image-ppi` error of about 76 ppi naming the image

#### Scenario: Gradient background
- **WHEN** a headline sits on a gradient
- **THEN** the contrast check SHALL report `info` that it was skipped, not a pass

#### Scenario: Long bound value runs into the next block
- **WHEN** row 3's title wraps onto the date line below it
- **THEN** preflight SHALL report an `overlap` warning for row 3 naming both elements, and SHALL NOT report rows whose text only sits close together

#### Scenario: QR code with the wrong URL
- **WHEN** `data-od-qr="https://example.com/a"` decodes to `https://example.com/b`
- **THEN** preflight SHALL report a `qr` error naming both values

### Requirement: Check Without Writing Files
`export_open_design_artifact` SHALL accept `checkOnly: true`, which runs the same load and preflight, including per-row checks with `data`, and returns findings without writing files or changing the manifest.

#### Scenario: Fix loop
- **WHEN** the agent calls export with `checkOnly: true`
- **THEN** no file under `exports/` SHALL be created or modified and the findings SHALL be returned
