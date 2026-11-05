## ADDED Requirements

### Requirement: Colour Checks Read Every Colour Format

The check's colour rules, including `contrast`, SHALL read colours in every format Chrome reports from `getComputedStyle`. The contrast walk SHALL count an element whose background it can't read as skipped, and SHALL NOT measure that element's text against an ancestor's or the page's background.

#### Scenario: White on an oklch button
- **WHEN** a button has `background: oklch(0.546 0.245 262.881)` and `color: #fff`
- **THEN** no `contrast` finding is raised for it

#### Scenario: Low contrast in oklch
- **WHEN** text is `oklch(0.8 0 0)` on `oklch(1 0 0)`
- **THEN** a `contrast` finding is raised with the measured ratio

#### Scenario: Colour-mix hover token
- **WHEN** a design's `--accent-hover` is `color-mix(in oklab, var(--accent) 85%, black)`
- **THEN** checks measure the hovered button with that colour
