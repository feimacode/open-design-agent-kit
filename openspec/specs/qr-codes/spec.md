# qr-codes Specification

## Purpose
Provide real, verifiable QR codes for designs: generated offline as SVG, stored with the artifact, generated per row during bulk export, and checked by preflight.
## Requirements
### Requirement: Offline QR Code Generation
The system SHALL expose `create_open_design_qr_code` in every host. It SHALL take a registered artifact's `entryPath`, the `text` to encode, and optionally `name`, `errorCorrection` (`L`, `M`, `Q` or `H`, default `M`) and `margin` (quiet-zone modules, default 4). It SHALL generate an SVG QR code locally with no network access, write it to `<artifact-dir>/assets/<name>.svg`, add it to the manifest's supporting files, and return its relative path and inline SVG markup carrying `data-od-qr="<text>"`. This is a generated data asset, not design. It is the only file this tool writes besides the manifest.

#### Scenario: Event registration link
- **WHEN** the tool is called with `text: "https://example.com/register"` and `name: "register-qr"`
- **THEN** `assets/register-qr.svg` SHALL exist, decode to that URL, and be listed in the manifest's supporting files

#### Scenario: Logo overlay advice
- **WHEN** the result is returned with error correction below `H`
- **THEN** it SHALL note that `H` is needed if a logo will be placed over the code

### Requirement: Per-Row QR Codes in Bulk Export
During bulk export, each `[data-od-qr-field="<column>"]` element SHALL receive a QR SVG of that row's value, generated the same way, and the bound element SHALL be given a matching `data-od-qr` so preflight verifies it.

#### Scenario: Personal ticket QR
- **WHEN** a ticket artifact with `data-od-qr-field="ticket_url"` is bulk-exported
- **THEN** each row's image SHALL contain a QR code that decodes to that row's `ticket_url`

