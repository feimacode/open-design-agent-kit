# shape-switching Specification

## Purpose
Let users pick or change a fluid design's shape after it is made: at export (one shape or several), in a shape sheet showing every shape at once, as a recorded default shape, and live in the VS Code preview, without ever changing the design file.
## Requirements
### Requirement: Export a Fluid Design at Any Shape
Exporting a fluid design with `preset` set to any catalog format SHALL set the card's `--od-w`/`--od-h` (and, for print, `--od-bleed`) to that shape in the rendered page, wait for layout, run preflight at that shape and capture it. The artifact file SHALL NOT be modified. Explicit `width`/`height` on a fluid design SHALL set `--od-w`/`--od-h` in px. With no preset or size, a fluid design SHALL be exported at its default shape (`metadata.format`), or at the shape authored in its CSS.

#### Scenario: A3 poster exported as 24×36
- **WHEN** a fluid poster with default shape `a3` is exported with `preset: "poster-24x36"`
- **THEN** the PDF SHALL be 24×36 in plus bleed, with the layout reflowed for 2:3, and the HTML file SHALL be unchanged

#### Scenario: Fixed design asked for another shape
- **WHEN** a fixed 1080×1350 design is exported with `preset: "story"`
- **THEN** the export SHALL proceed as before, and preflight SHALL report `card-size` with a hint that the design is fixed-size and `adapt_open_design_artifact` makes other shapes

### Requirement: Several Shapes in One Export
`export_open_design_artifact` SHALL accept `presets`: 1–15 catalog format ids, which can't be combined with `preset`, `width` or `height`. For each shape, it SHALL apply the shape, run preflight, and write `<base>-<formatId>.<ext>`: a PDF for print shapes and a PNG for screen shapes unless `format` is given. Findings SHALL be grouped by shape. On a fixed design, `presets` SHALL fail with a message pointing to `adapt_open_design_artifact`.

#### Scenario: Print and social in one call
- **WHEN** a fluid poster is exported with `presets: ["a3", "ig-portrait", "story"]`
- **THEN** `poster-a3.pdf`, `poster-ig-portrait.png` and `poster-story.png` SHALL be written, each preflighted at its own shape

### Requirement: Shape Sheet
`export_open_design_artifact` SHALL accept `shapeSheet: true`, which writes one image `exports/<base>-shapes.png` showing the design at each shape in `presets` (all catalog formats when `presets` is absent), each labelled with its format and marked with whether preflight found errors at that shape. With `checkOnly: true`, the shape sheet SHALL be the only file written, and the manifest SHALL NOT change. It SHALL require a fluid design.

#### Scenario: See every shape at once
- **WHEN** a fluid poster is exported with `shapeSheet: true, checkOnly: true`
- **THEN** `poster-shapes.png` SHALL show all 15 catalog shapes with labels, and the result SHALL list findings per shape

### Requirement: Default Shape
For fluid designs, `metadata.format` SHALL mean the default shape, used when no preset or size is given and as the shape the preview opens at. Recording a new default SHALL NOT modify the HTML.

#### Scenario: Default changed
- **WHEN** a fluid poster's default shape is changed from `a3` to `poster-18x24`
- **THEN** an export with no preset and no format SHALL produce the 18×24 in print PDF (with bleed), and `format: "png"` SHALL produce an 18×24 in image instead

### Requirement: Shape Switcher in the VS Code Preview
For fluid designs, the VS Code artifact preview SHALL show a Shape dropdown of the catalog formats, with the default first. Choosing one SHALL resize the card in the preview only, scaled to fit the panel. **Check this shape** SHALL run the export's preflight with `checkOnly` at that shape and show the findings. **Use as default shape** SHALL record `metadata.format`. For fixed designs, the dropdown SHALL be replaced by a note that the design is fixed-size and the agent can adapt it.

#### Scenario: Trying shapes in the preview
- **WHEN** the user picks "Story / Reels / TikTok cover" in the dropdown for a fluid poster
- **THEN** the preview SHALL show the poster reflowed at 9:16, and no file SHALL change

#### Scenario: Checking a shape
- **WHEN** the user clicks Check this shape at `a2`
- **THEN** the preview SHALL show the same findings an `export_open_design_artifact` call with `preset: "a2", checkOnly: true` returns

